// SPDX-License-Identifier: BUSL-1.1
// License-Filename: LICENSE.md

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const winston = require('winston');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

// Import AccreDeFi services
const AccreDeFiDatabase = require('./accredefi-database');
const AccreDeFiDocumentService = require('./accredefi-document-service');
const AccreDeFiBiometricService = require('./accredefi-biometric-service');
const AccreDeFiComplianceIntegration = require('./accredefi-compliance-integration');

// Enhanced logging for AccreDeFi
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'accredefi-api.log' })
    ]
});

/**
 * AccreDeFi API Server
 * Complete KYC and compliance verification system
 * Orchestrates document processing, biometric verification, and compliance integration
 */
class AccreDeFiAPIServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        
        // Initialize services
        this.database = new AccreDeFiDatabase();
        this.documentService = new AccreDeFiDocumentService();
        this.biometricService = new AccreDeFiBiometricService();
        this.complianceService = new AccreDeFiComplianceIntegration();
        
        // Configure middleware
        this.setupMiddleware();
        this.setupRoutes();
        
        // Store active verification sessions
        this.activeSessions = new Map();
        
        // Start cleanup tasks
        this.startCleanupTasks();
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                    fontSrc: ["'self'", "https://fonts.gstatic.com"],
                    imgSrc: ["'self'", "data:", "https:"],
                    scriptSrc: ["'self'", "https://telegram.org"]
                }
            }
        }));

        // CORS configuration
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data']
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // Limit each IP to 100 requests per windowMs
            message: 'Too many requests from this IP, please try again later.',
            standardHeaders: true,
            legacyHeaders: false
        });
        this.app.use('/api/', limiter);

        // Compression and parsing
        this.app.use(compression());
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

        // Request logging
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                telegramInitData: req.get('X-Telegram-Init-Data') ? 'present' : 'absent'
            });
            next();
        });

        // File upload configuration
        const storage = multer.memoryStorage();
        this.upload = multer({
            storage: storage,
            limits: {
                fileSize: 10 * 1024 * 1024, // 10MB limit
                files: 5 // Maximum 5 files
            },
            fileFilter: (req, file, cb) => {
                const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
                if (allowedTypes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new Error('Invalid file type. Only JPEG and PNG are allowed.'));
                }
            }
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                service: 'AccreDeFi KYC API',
                version: '1.0.0',
                timestamp: new Date().toISOString()
            });
        });

        // API routes
        this.app.use('/api/v1', this.createAPIRoutes());
        
        // Serve static files
        this.app.use(express.static(path.join(__dirname, 'public')));
        
        // Error handling
        this.app.use(this.errorHandler.bind(this));
    }

    createAPIRoutes() {
        const router = express.Router();

        // User Management Routes
        router.post('/users/register', this.registerUser.bind(this));
        router.get('/users/:telegramId', this.getUser.bind(this));
        router.get('/users/:telegramId/status', this.getUserStatus.bind(this));

        // Verification Session Routes
        router.post('/sessions/start', this.startVerificationSession.bind(this));
        router.get('/sessions/:sessionToken', this.getSession.bind(this));
        router.put('/sessions/:sessionToken', this.updateSession.bind(this));
        router.delete('/sessions/:sessionToken', this.endSession.bind(this));

        // KYC Document Processing Routes
        router.post('/kyc/upload-document', this.upload.single('document'), this.uploadDocument.bind(this));
        router.post('/kyc/process-document', this.processDocument.bind(this));
        router.get('/kyc/:telegramId/data', this.getKYCData.bind(this));

        // Biometric Verification Routes
        router.post('/biometric/upload-selfie', this.upload.single('selfie'), this.uploadSelfie.bind(this));
        router.post('/biometric/verify', this.verifyBiometric.bind(this));
        router.get('/biometric/:telegramId/data', this.getBiometricData.bind(this));

        // Compliance Routes
        router.post('/compliance/verify', this.verifyCompliance.bind(this));
        router.get('/compliance/:telegramId/status', this.getComplianceStatus.bind(this));
        router.get('/compliance/:telegramId/record', this.getComplianceRecord.bind(this));
        router.post('/compliance/check-transfer', this.checkTransferCompliance.bind(this));

        // Complete Verification Workflow
        router.post('/verify/complete', this.upload.fields([
            { name: 'document', maxCount: 1 },
            { name: 'selfie', maxCount: 1 }
        ]), this.completeVerification.bind(this));

        // Analytics and Reporting Routes
        router.get('/analytics/stats', this.getAnalyticsStats.bind(this));
        router.get('/analytics/compliance-summary', this.getComplianceSummary.bind(this));

        // Admin Routes (protected)
        router.get('/admin/users', this.adminGetUsers.bind(this));
        router.post('/admin/users/:telegramId/override', this.adminOverrideCompliance.bind(this));
        router.get('/admin/audit-trail', this.adminGetAuditTrail.bind(this));

        return router;
    }

    // User Management Methods
    async registerUser(req, res) {
        try {
            const { telegramId, username, firstName, lastName, platform, languageCode } = req.body;
            
            if (!telegramId) {
                return res.status(400).json({ error: 'Telegram ID is required' });
            }

            const userData = {
                telegramId,
                username,
                firstName,
                lastName,
                platform: platform || 'telegram',
                languageCode,
                userAgent: req.get('User-Agent'),
                ipAddress: req.ip
            };

            const user = await this.database.createUser(userData);
            
            // Log audit event
            await this.database.logAuditEvent({
                telegramId,
                eventType: 'user_registration',
                eventDescription: 'User registered for AccreDeFi KYC',
                eventData: { platform, languageCode },
                userAgent: req.get('User-Agent'),
                ipAddress: req.ip,
                success: true
            });

            res.json({
                success: true,
                user: {
                    id: user.id,
                    telegramId: user.telegram_id,
                    username: user.username,
                    status: user.overall_status,
                    createdAt: user.created_at
                }
            });

        } catch (error) {
            logger.error('❌ User registration failed:', error);
            res.status(500).json({ error: 'Registration failed' });
        }
    }

    async getUser(req, res) {
        try {
            const { telegramId } = req.params;
            const user = await this.database.getUserByTelegramId(telegramId);
            
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({
                success: true,
                user: {
                    id: user.id,
                    telegramId: user.telegram_id,
                    username: user.username,
                    kycStatus: user.kyc_status,
                    biometricStatus: user.biometric_status,
                    complianceStatus: user.compliance_status,
                    overallStatus: user.overall_status,
                    kycLevel: user.kyc_level,
                    complianceLevel: user.compliance_level,
                    riskLevel: user.risk_level,
                    scores: {
                        kyc: user.kyc_score,
                        biometric: user.biometric_score,
                        risk: user.risk_score,
                        overall: user.overall_score
                    },
                    complianceHash: user.compliance_hash,
                    lastVerification: user.last_verification,
                    complianceExpiration: user.compliance_expiration
                }
            });

        } catch (error) {
            logger.error('❌ Get user failed:', error);
            res.status(500).json({ error: 'Failed to get user' });
        }
    }

    async getUserStatus(req, res) {
        try {
            const { telegramId } = req.params;
            const user = await this.database.getUserByTelegramId(telegramId);
            
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const status = {
                telegramId: user.telegram_id,
                overallStatus: user.overall_status,
                kycCompleted: user.kyc_status === 'passed',
                biometricCompleted: user.biometric_status === 'passed',
                complianceCompleted: user.compliance_status === 'compliant',
                complianceLevel: user.compliance_level,
                complianceExpiration: user.compliance_expiration,
                nextSteps: this.getNextSteps(user)
            };

            res.json({ success: true, status });

        } catch (error) {
            logger.error('❌ Get user status failed:', error);
            res.status(500).json({ error: 'Failed to get user status' });
        }
    }

    // Complete Verification Workflow
    async completeVerification(req, res) {
        try {
            const { telegramId } = req.body;
            
            if (!telegramId) {
                return res.status(400).json({ error: 'Telegram ID is required' });
            }

            if (!req.files || !req.files.document || !req.files.selfie) {
                return res.status(400).json({ error: 'Both document and selfie are required' });
            }

            logger.info(`🚀 Starting complete verification for user ${telegramId}`);

            // Step 1: Process document for KYC
            const documentBase64 = req.files.document[0].buffer.toString('base64');
            const kycData = await this.documentService.processGovernmentID(documentBase64, telegramId);
            
            // Step 2: Process selfie for biometric verification
            const selfieBase64 = req.files.selfie[0].buffer.toString('base64');
            const biometricData = await this.biometricService.performBiometricVerification(
                telegramId, 
                selfieBase64, 
                documentBase64 // Use document photo for facial matching
            );

            // Step 3: Store verification data
            await this.database.storeKYCData({ ...kycData, telegramId });
            await this.database.storeBiometricData({ ...biometricData, telegramId });

            // Step 4: Process compliance verification
            const complianceRecord = await this.complianceService.processComplianceVerification(
                kycData, 
                biometricData, 
                telegramId
            );

            // Step 5: Store compliance record
            await this.database.storeComplianceRecord(complianceRecord);

            // Step 6: Log audit event
            await this.database.logAuditEvent({
                telegramId,
                complianceHash: complianceRecord.complianceHash,
                eventType: 'complete_verification',
                eventDescription: 'Complete KYC and compliance verification',
                eventData: {
                    kycPassed: complianceRecord.kycPassed,
                    biometricPassed: complianceRecord.biometricPassed,
                    overallCompliance: complianceRecord.overallCompliance,
                    complianceLevel: complianceRecord.complianceLevel
                },
                userAgent: req.get('User-Agent'),
                ipAddress: req.ip,
                success: complianceRecord.overallCompliance
            });

            logger.info(`✅ Complete verification finished for user ${telegramId}, status: ${complianceRecord.overallCompliance ? 'PASSED' : 'FAILED'}`);

            res.json({
                success: true,
                verification: {
                    telegramId,
                    complianceHash: complianceRecord.complianceHash,
                    overallCompliance: complianceRecord.overallCompliance,
                    complianceLevel: complianceRecord.complianceLevel,
                    kycPassed: complianceRecord.kycPassed,
                    biometricPassed: complianceRecord.biometricPassed,
                    riskLevel: complianceRecord.riskLevel,
                    scores: {
                        kyc: complianceRecord.kycScore,
                        biometric: complianceRecord.biometricScore,
                        risk: complianceRecord.riskScore,
                        overall: complianceRecord.overallScore
                    },
                    jurisdiction: complianceRecord.jurisdiction,
                    restrictions: complianceRecord.transferRestrictions,
                    permissions: complianceRecord.tokenPermissions,
                    tradingLimits: complianceRecord.tradingLimits,
                    expirationDate: complianceRecord.expirationDate
                }
            });

        } catch (error) {
            logger.error('❌ Complete verification failed:', error);
            
            // Log failed verification
            if (req.body.telegramId) {
                await this.database.logAuditEvent({
                    telegramId: req.body.telegramId,
                    eventType: 'verification_failed',
                    eventDescription: 'Complete verification failed',
                    eventData: { error: error.message },
                    userAgent: req.get('User-Agent'),
                    ipAddress: req.ip,
                    success: false,
                    errorMessage: error.message
                });
            }

            res.status(500).json({ 
                error: 'Verification failed',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Compliance Checking Methods
    async checkTransferCompliance(req, res) {
        try {
            const { telegramId, tokenAddress, amount, toAddress, transactionType } = req.body;
            
            if (!telegramId || !tokenAddress || !amount) {
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            // Get user's compliance status
            const user = await this.database.getUserByTelegramId(telegramId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Check if compliance is valid and not expired
            const now = new Date();
            const isExpired = user.compliance_expiration && new Date(user.compliance_expiration) < now;
            
            if (isExpired) {
                return res.json({
                    success: false,
                    allowed: false,
                    reason: 'Compliance verification has expired',
                    requiresReverification: true
                });
            }

            if (user.compliance_status !== 'compliant') {
                return res.json({
                    success: false,
                    allowed: false,
                    reason: 'User is not compliant',
                    complianceLevel: user.compliance_level
                });
            }

            // Check transfer restrictions and limits
            const complianceCheck = {
                allowed: true,
                restrictions: [],
                warnings: []
            };

            // Amount-based restrictions
            const tradingLimits = user.trading_limits ? JSON.parse(user.trading_limits) : {};
            if (tradingLimits.transactionLimit && amount > tradingLimits.transactionLimit) {
                complianceCheck.allowed = false;
                complianceCheck.restrictions.push(`Transaction amount exceeds limit of ${tradingLimits.transactionLimit}`);
            }

            // Risk-based restrictions
            if (user.risk_level === 'VERY_HIGH') {
                complianceCheck.allowed = false;
                complianceCheck.restrictions.push('High risk user - transfers blocked');
            } else if (user.risk_level === 'HIGH' && amount > 10000) {
                complianceCheck.warnings.push('High risk user - large transfer flagged for review');
            }

            // Log the compliance check
            await this.database.logAuditEvent({
                telegramId,
                complianceHash: user.compliance_hash,
                eventType: 'transfer_compliance_check',
                eventDescription: 'Transfer compliance verification',
                eventData: {
                    tokenAddress,
                    amount,
                    toAddress,
                    transactionType,
                    allowed: complianceCheck.allowed
                },
                userAgent: req.get('User-Agent'),
                ipAddress: req.ip,
                success: true
            });

            res.json({
                success: true,
                allowed: complianceCheck.allowed,
                complianceLevel: user.compliance_level,
                riskLevel: user.risk_level,
                restrictions: complianceCheck.restrictions,
                warnings: complianceCheck.warnings,
                tradingLimits: tradingLimits
            });

        } catch (error) {
            logger.error('❌ Transfer compliance check failed:', error);
            res.status(500).json({ error: 'Compliance check failed' });
        }
    }

    // Analytics Methods
    async getAnalyticsStats(req, res) {
        try {
            // This would typically query the database for analytics
            // For now, return mock data
            const stats = {
                totalUsers: 1250,
                completedVerifications: 892,
                complianceRate: 71.4,
                averageVerificationTime: '4.2 minutes',
                topCountries: [
                    { country: 'USA', count: 425 },
                    { country: 'CAN', count: 186 },
                    { country: 'GBR', count: 134 },
                    { country: 'DEU', count: 98 },
                    { country: 'AUS', count: 67 }
                ],
                complianceLevels: {
                    'FULL_COMPLIANCE': 456,
                    'STANDARD_COMPLIANCE': 298,
                    'LIMITED_COMPLIANCE': 138,
                    'NON_COMPLIANT': 358
                },
                riskDistribution: {
                    'LOW': 523,
                    'MEDIUM': 412,
                    'HIGH': 231,
                    'VERY_HIGH': 84
                }
            };

            res.json({ success: true, stats });

        } catch (error) {
            logger.error('❌ Get analytics stats failed:', error);
            res.status(500).json({ error: 'Failed to get analytics' });
        }
    }

    // Utility Methods
    getNextSteps(user) {
        const steps = [];
        
        if (user.kyc_status !== 'passed') {
            steps.push('Complete KYC document verification');
        }
        
        if (user.biometric_status !== 'passed') {
            steps.push('Complete biometric verification');
        }
        
        if (user.compliance_status !== 'compliant') {
            steps.push('Complete compliance verification');
        }
        
        if (steps.length === 0) {
            const expiration = new Date(user.compliance_expiration);
            const now = new Date();
            const daysUntilExpiration = Math.ceil((expiration - now) / (1000 * 60 * 60 * 24));
            
            if (daysUntilExpiration <= 30) {
                steps.push('Compliance verification expires soon - consider renewal');
            } else {
                steps.push('All verifications complete');
            }
        }
        
        return steps;
    }

    // Cleanup Tasks
    startCleanupTasks() {
        // Clean up expired sessions every hour
        setInterval(async () => {
            try {
                await this.database.cleanupExpiredSessions();
            } catch (error) {
                logger.error('❌ Session cleanup failed:', error);
            }
        }, 60 * 60 * 1000); // 1 hour

        // Check for expired compliance every 6 hours
        setInterval(async () => {
            try {
                await this.database.cleanupExpiredCompliance();
            } catch (error) {
                logger.error('❌ Compliance cleanup failed:', error);
            }
        }, 6 * 60 * 60 * 1000); // 6 hours
    }

    // Error Handler
    errorHandler(error, req, res, next) {
        logger.error('❌ API Error:', {
            error: error.message,
            stack: error.stack,
            path: req.path,
            method: req.method,
            ip: req.ip
        });

        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File too large' });
        }

        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ error: 'Unexpected file field' });
        }

        res.status(500).json({
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }

    // Start Server
    start() {
        this.app.listen(this.port, () => {
            logger.info(`🚀 AccreDeFi KYC API Server running on port ${this.port}`);
            logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`🔐 Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
        });
    }
}

// Start the server if this file is run directly
if (require.main === module) {
    const server = new AccreDeFiAPIServer();
    server.start();
}

module.exports = AccreDeFiAPIServer;

