const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const winston = require('winston');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import our services
const database = require('./database');
const TonWalletService = require('./ton-wallet-service');
const DocumentService = require('./document-service');
const TelegramService = require('./telegram-service');

// Enhanced logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'agenonymous.log' })
    ]
});

class AgenonymousServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        
        // Initialize services
        this.tonWallet = new TonWalletService();
        this.documentService = new DocumentService();
        this.telegramService = new TelegramService();
        
        // Configure middleware
        this.setupMiddleware();
        this.setupRoutes();
        
        // Store active verification sessions
        this.activeSessions = new Map();
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "https://telegram.org"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "https://api.telegram.org"]
                }
            }
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // Limit each IP to 100 requests per windowMs
            message: 'Too many requests from this IP'
        });
        this.app.use('/api/', limiter);

        // CORS configuration
        this.app.use(cors({
            origin: ['https://web.telegram.org', 'https://t.me'],
            credentials: true
        }));

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Static files for Mini App
        this.app.use(express.static('public'));

        // File upload configuration
        this.upload = multer({
            storage: multer.memoryStorage(),
            limits: {
                fileSize: 10 * 1024 * 1024, // 10MB limit
                files: 1
            },
            fileFilter: (req, file, cb) => {
                if (file.mimetype.startsWith('image/')) {
                    cb(null, true);
                } else {
                    cb(new Error('Only image files are allowed'));
                }
            }
        });

        // Request logging
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('user-agent'),
                body: req.method === 'POST' ? 'REDACTED' : undefined
            });
            next();
        });
    }

    setupRoutes() {
        // Serve Mini App
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // Telegram webhook
        this.app.post('/webhook', this.handleWebhook.bind(this));

        // API Routes
        this.app.post('/api/verify/start', this.validateInitData.bind(this), this.startVerification.bind(this));
        this.app.post('/api/verify/upload', this.upload.single('document'), this.validateInitData.bind(this), this.processDocument.bind(this));
        this.app.post('/api/verify/payment', this.validateInitData.bind(this), this.processPayment.bind(this));
        this.app.post('/api/verify/complete', this.validateInitData.bind(this), this.completeVerification.bind(this));
        this.app.get('/api/verify/status/:sessionId', this.getVerificationStatus.bind(this));
        
        // Affiliate routes
        this.app.post('/api/affiliate/create', this.validateInitData.bind(this), this.createAffiliate.bind(this));
        this.app.get('/api/affiliate/stats', this.validateInitData.bind(this), this.getAffiliateStats.bind(this));

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'OK', timestamp: new Date().toISOString() });
        });

        // Error handling
        this.app.use(this.errorHandler.bind(this));
    }

    // Telegram init data validation middleware
    async validateInitData(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('tma ')) {
                return res.status(401).json({ error: 'Invalid authorization header' });
            }

            const initDataRaw = authHeader.substring(4);
            
            // Validate init data signature
            if (!this.telegramService.validateInitData(initDataRaw)) {
                return res.status(401).json({ error: 'Invalid init data signature' });
            }

            // Parse init data
            const initData = this.telegramService.parseInitData(initDataRaw);
            req.telegramUser = initData.user;
            req.initData = initData;

            next();
        } catch (error) {
            logger.error('Init data validation failed:', error);
            res.status(401).json({ error: 'Authentication failed' });
        }
    }

    // Telegram webhook handler
    async handleWebhook(req, res) {
        try {
            const update = req.body;
            logger.info('Webhook received:', { updateId: update.update_id });

            // Handle different update types
            if (update.message) {
                await this.telegramService.handleMessage(update.message);
            } else if (update.callback_query) {
                await this.telegramService.handleCallbackQuery(update.callback_query);
            } else if (update.pre_checkout_query) {
                await this.handlePreCheckoutQuery(update.pre_checkout_query);
            } else if (update.successful_payment) {
                await this.handleSuccessfulPayment(update.successful_payment, update.message);
            }

            res.status(200).json({ ok: true });
        } catch (error) {
            logger.error('Webhook error:', error);
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    }

    // Start verification process
    async startVerification(req, res) {
        try {
            const { telegramHandle, affiliateCode } = req.body;
            const telegramUser = req.telegramUser;

            // Create or update user
            await database.createOrUpdateUser(telegramUser, 'telegram_miniapp');

            // Create verification session
            const sessionToken = await database.createSession(telegramUser.id);

            // Track analytics
            await database.trackEvent('verification_started', telegramUser.id, {
                telegram_handle: telegramHandle,
                affiliate_code: affiliateCode
            }, sessionToken);

            // Store session data
            this.activeSessions.set(sessionToken, {
                telegramId: telegramUser.id,
                telegramHandle,
                affiliateCode,
                status: 'started',
                createdAt: new Date()
            });

            res.json({
                success: true,
                sessionToken,
                message: "Verification session created. Please upload your government ID.",
                pricing: {
                    total_stars: 167,
                    your_cost: 67, // 167 - 100 = 67 Stars to service
                    affiliate_commission: affiliateCode ? 100 : 0
                }
            });

        } catch (error) {
            logger.error('Start verification error:', error);
            res.status(500).json({ error: 'Failed to start verification' });
        }
    }

    // Process document upload
    async processDocument(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No document uploaded' });
            }

            const { sessionToken } = req.body;
            const session = await database.getSession(sessionToken);
            
            if (!session) {
                return res.status(404).json({ error: 'Invalid session' });
            }

            // Process document with AWS Textract
            const documentData = await this.documentService.processDocument(req.file.buffer);
            
            if (!documentData.country || !documentData.region || !documentData.documentNumber) {
                return res.status(400).json({ 
                    error: 'Could not extract required information from document. Please ensure Country, State/Region, and ID Number are visible.' 
                });
            }

            // Update session with document data
            const sessionData = this.activeSessions.get(sessionToken);
            sessionData.documentData = documentData;
            sessionData.status = 'document_processed';

            // Track analytics
            await database.trackEvent('document_processed', session.telegram_id, {
                country: documentData.country,
                region: documentData.region,
                document_type: documentData.documentType
            }, sessionToken);

            res.json({
                success: true,
                message: "Document processed successfully. Ready for payment.",
                extracted_data: {
                    country: documentData.country,
                    region: documentData.region,
                    document_type: documentData.documentType
                },
                next_step: "payment"
            });

        } catch (error) {
            logger.error('Document processing error:', error);
            res.status(500).json({ error: 'Failed to process document' });
        }
    }

    // Process Telegram Stars payment
    async processPayment(req, res) {
        try {
            const { sessionToken } = req.body;
            const telegramUser = req.telegramUser;
            
            const session = await database.getSession(sessionToken);
            const sessionData = this.activeSessions.get(sessionToken);
            
            if (!session || !sessionData || !sessionData.documentData) {
                return res.status(400).json({ error: 'Invalid session or missing document data' });
            }

            // Create Telegram Stars invoice
            const invoice = await this.telegramService.createStarsInvoice({
                telegramId: telegramUser.id,
                amount: 167, // $2.50 = 167 Stars
                description: "Agenonymous Age Verification",
                payload: JSON.stringify({
                    sessionToken,
                    type: 'age_verification'
                })
            });

            // Track payment initiation
            await database.trackEvent('payment_initiated', telegramUser.id, {
                amount_stars: 167,
                invoice_url: invoice.invoice_url
            }, sessionToken);

            res.json({
                success: true,
                message: "Payment invoice created",
                payment_url: invoice.invoice_url,
                amount_stars: 167,
                description: "Complete payment to continue verification"
            });

        } catch (error) {
            logger.error('Payment processing error:', error);
            res.status(500).json({ error: 'Failed to process payment' });
        }
    }

    // Handle successful payment
    async handleSuccessfulPayment(payment, message) {
        try {
            const payload = JSON.parse(payment.invoice_payload);
            const sessionToken = payload.sessionToken;
            
            const sessionData = this.activeSessions.get(sessionToken);
            if (!sessionData) {
                logger.error('Session not found for payment:', sessionToken);
                return;
            }

            // Create pre-funded TON wallet with seed phrase
            const preFundedWallet = await this.tonWallet.createPreFundedWallet(
                sessionData.telegramId,
                '0.02' // 0.02 TON funding
            );

            // Store wallet in database
            await database.storePreFundedWallet(preFundedWallet, sessionData.telegramId);

            // Update session
            sessionData.status = 'payment_confirmed';
            sessionData.walletData = preFundedWallet;

            // Send wallet details to user via Mini App
            await this.telegramService.sendMessage(sessionData.telegramId, {
                text: "🎉 Payment confirmed! Your verification wallet has been created.",
                reply_markup: {
                    inline_keyboard: [[
                        { text: "Open Verification Wallet", web_app: { url: `${process.env.APP_URL}/?session=${sessionToken}` } }
                    ]]
                }
            });

            // Track payment success
            await database.trackEvent('payment_confirmed', sessionData.telegramId, {
                amount_stars: 167,
                wallet_address: preFundedWallet.address
            }, sessionToken);

            logger.info(`Payment confirmed for session ${sessionToken}`);

        } catch (error) {
            logger.error('Payment confirmation error:', error);
        }
    }

    // Complete verification after return transaction
    async completeVerification(req, res) {
        try {
            const { sessionToken, returnTransactionHash } = req.body;
            const telegramUser = req.telegramUser;
            
            const session = await database.getSession(sessionToken);
            const sessionData = this.activeSessions.get(sessionToken);
            
            if (!session || !sessionData || !sessionData.walletData) {
                return res.status(400).json({ error: 'Invalid session' });
            }

            // Verify the return transaction on TON blockchain
            const isValidTransaction = await this.tonWallet.verifyReturnTransaction(
                sessionData.walletData.address,
                returnTransactionHash,
                '0.001' // Expected return amount
            );

            if (!isValidTransaction) {
                return res.status(400).json({ error: 'Invalid return transaction' });
            }

            // Create verification credential
            const credentialData = {
                telegramId: telegramUser.id,
                username: sessionData.telegramHandle,
                ageBucket: this.determineAgeBucket(sessionData.documentData.extractedText),
                country: sessionData.documentData.country,
                region: sessionData.documentData.region,
                credentialHash: crypto.createHash('sha256')
                    .update(sessionData.documentData.documentNumber + process.env.ENCRYPTION_KEY)
                    .digest('hex'),
                walletAddress: sessionData.walletData.address,
                returnTransactionHash,
                affiliateCode: sessionData.affiliateCode
            };

            // Store verification result
            const verificationId = await database.storeVerificationResult(credentialData);

            // Generate certificate
            const certificate = this.generateCertificate(credentialData, verificationId);

            // Send completion message
            await this.telegramService.sendMessage(telegramUser.id, {
                text: `✅ Age verification complete!\n\n🏆 Certificate ID: ${verificationId}\n🌍 Jurisdiction: ${credentialData.country}, ${credentialData.region}\n👤 Age Bracket: ${credentialData.ageBucket}\n\n Your anonymous age credential is now active.`,
                reply_markup: {
                    inline_keyboard: [[
                        { text: "Download Certificate", callback_data: `download_cert_${verificationId}` }
                    ]]
                }
            });

            // Process affiliate payout if applicable
            if (sessionData.affiliateCode) {
                await database.processAffiliatePayout(verificationId, sessionData.affiliateCode);
                
                // Notify affiliate
                const affiliate = await database.pool.query(
                    'SELECT telegram_id FROM affiliates WHERE affiliate_code = $1',
                    [sessionData.affiliateCode]
                );
                
                if (affiliate.rows.length > 0) {
                    await this.telegramService.sendMessage(affiliate.rows[0].telegram_id, {
                        text: `💰 Affiliate Commission Earned!\n\n⭐ +100 Telegram Stars\n👤 Referral completed verification\n💵 Total earnings updated`
                    });
                }
            }

            // Clean up session
            this.activeSessions.delete(sessionToken);

            // Track completion
            await database.trackEvent('verification_completed', telegramUser.id, {
                verification_id: verificationId,
                certificate_id: certificate.id
            }, sessionToken);

            res.json({
                success: true,
                message: "Age verification completed successfully!",
                certificate,
                verification_id: verificationId
            });

        } catch (error) {
            logger.error('Verification completion error:', error);
            res.status(500).json({ error: 'Failed to complete verification' });
        }
    }

    // Get verification status
    async getVerificationStatus(req, res) {
        try {
            const { sessionId } = req.params;
            const sessionData = this.activeSessions.get(sessionId);
            
            if (!sessionData) {
                return res.status(404).json({ error: 'Session not found' });
            }

            // If wallet created, include seed phrase for display
            let responseData = {
                status: sessionData.status,
                telegram_id: sessionData.telegramId,
                created_at: sessionData.createdAt
            };

            if (sessionData.walletData && sessionData.status === 'payment_confirmed') {
                responseData.wallet = {
                    address: sessionData.walletData.address,
                    seedPhrase: sessionData.walletData.seedPhrase, // 24 words for user to import
                    balance: "0.02 TON",
                    instruction: "Import these 24 words into any TON wallet, then send back 0.001 TON to complete verification"
                };
                responseData.returnAddress = process.env.AGENONYMOUS_TON_WALLET;
            }

            res.json(responseData);

        } catch (error) {
            logger.error('Status check error:', error);
            res.status(500).json({ error: 'Failed to get status' });
        }
    }

    // Create affiliate account
    async createAffiliate(req, res) {
        try {
            const { affiliateCode } = req.body;
            const telegramUser = req.telegramUser;

            // Validate affiliate code format
            if (!/^[A-Za-z0-9_-]{3,20}$/.test(affiliateCode)) {
                return res.status(400).json({ 
                    error: 'Invalid affiliate code. Use 3-20 characters: letters, numbers, underscore, dash only.' 
                });
            }

            const affiliate = await database.createAffiliate(telegramUser.id, affiliateCode);
            
            if (!affiliate) {
                return res.status(409).json({ error: 'Affiliate code already exists' });
            }

            // Generate affiliate link
            const affiliateLink = `https://t.me/${process.env.BOT_USERNAME}?startapp=${affiliateCode}`;

            await this.telegramService.sendMessage(telegramUser.id, {
                text: `🎉 Affiliate account created!\n\n🔗 Your Link: ${affiliateLink}\n💰 Commission: 100 Stars per referral (60%)\n📊 Track earnings in the Mini App`
            });

            res.json({
                success: true,
                affiliate_code: affiliateCode,
                affiliate_link: affiliateLink,
                commission_rate: 0.60,
                commission_per_referral: 100
            });

        } catch (error) {
            logger.error('Affiliate creation error:', error);
            res.status(500).json({ error: 'Failed to create affiliate account' });
        }
    }

    // Get affiliate statistics
    async getAffiliateStats(req, res) {
        try {
            const telegramUser = req.telegramUser;

            const stats = await database.pool.query(`
                SELECT 
                    a.affiliate_code,
                    a.total_referrals,
                    a.total_earnings_stars,
                    a.conversion_rate,
                    COUNT(r.id) as pending_payouts,
                    SUM(CASE WHEN r.paid_at IS NULL THEN r.commission_stars ELSE 0 END) as pending_stars
                FROM affiliates a
                LEFT JOIN referrals r ON a.id = r.affiliate_id
                WHERE a.telegram_id = $1
                GROUP BY a.id, a.affiliate_code, a.total_referrals, a.total_earnings_stars, a.conversion_rate
            `, [telegramUser.id]);

            if (stats.rows.length === 0) {
                return res.status(404).json({ error: 'Affiliate account not found' });
            }

            const affiliate = stats.rows[0];
            const affiliateLink = `https://t.me/${process.env.BOT_USERNAME}?startapp=${affiliate.affiliate_code}`;

            res.json({
                affiliate_code: affiliate.affiliate_code,
                affiliate_link: affiliateLink,
                total_referrals: affiliate.total_referrals || 0,
                total_earnings_stars: affiliate.total_earnings_stars || 0,
                pending_payouts: affiliate.pending_payouts || 0,
                pending_stars: affiliate.pending_stars || 0,
                conversion_rate: affiliate.conversion_rate || 0,
                commission_rate: 0.60
            });

        } catch (error) {
            logger.error('Affiliate stats error:', error);
            res.status(500).json({ error: 'Failed to get affiliate stats' });
        }
    }

    // Utility functions
    determineAgeBucket(extractedText) {
        // Simple age bucket determination - could be enhanced with better logic
        return "18+"; // For now, all verifications result in 18+ bucket
    }

    generateCertificate(credentialData, verificationId) {
        return {
            id: verificationId,
            issued_to: "Anonymous User",
            age_bracket: credentialData.ageBucket,
            jurisdiction: `${credentialData.country}, ${credentialData.region}`,
            issued_date: new Date().toISOString(),
            blockchain_proof: credentialData.returnTransactionHash,
            expires: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString(), // 2 years
            issuer: "Agenonymous"
        };
    }

    // Error handler
    errorHandler(error, req, res, next) {
        logger.error('Server error:', {
            error: error.message,
            stack: error.stack,
            url: req.url,
            method: req.method
        });

        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
        }

        if (error.message === 'Only image files are allowed') {
            return res.status(400).json({ error: error.message });
        }

        res.status(500).json({ 
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
    }

    // Start server
    async start() {
        try {
            // Initialize services
            await this.tonWallet.initialize();
            await this.documentService.initialize();
            await this.telegramService.initialize();

            // Set webhook
            await this.telegramService.setWebhook(`${process.env.APP_URL}/webhook`);

            this.app.listen(this.port, () => {
                logger.info(`🚀 Agenonymous server running on port ${this.port}`);
                logger.info(`📱 Mini App URL: ${process.env.APP_URL}`);
                logger.info(`🤖 Bot: @${process.env.BOT_USERNAME}`);
                logger.info(`💰 Pricing: 167 Stars ($2.50) - 60% to affiliates`);
            });
        } catch (error) {
            logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    // Graceful shutdown
    async shutdown() {
        logger.info('Shutting down server...');
        await database.close();
        process.exit(0);
    }
}

// Handle shutdown signals
const server = new AgenonymousServer();

process.on('SIGTERM', () => server.shutdown());
process.on('SIGINT', () => server.shutdown());

// Start server
server.start().catch(error => {
    logger.error('Startup error:', error);
    process.exit(1);
});

module.exports = AgenonymousServer;
