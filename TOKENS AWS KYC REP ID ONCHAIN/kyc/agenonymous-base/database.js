const { Pool } = require('pg');
const crypto = require('crypto');
const winston = require('winston');

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

class AgenonymousDatabase {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 20,
            connectionTimeoutMillis: 30000,
            idleTimeoutMillis: 30000
        });
        this.initDatabase();
    }

    async initDatabase() {
        try {
            // Enhanced users table with analytics
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    telegram_id BIGINT NOT NULL UNIQUE,
                    username TEXT,
                    first_name TEXT,
                    verification_status TEXT DEFAULT 'pending',
                    verification_count INTEGER DEFAULT 0,
                    total_spent_stars INTEGER DEFAULT 0,
                    affiliate_earnings_stars INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    platform VARCHAR(50),
                    language_code VARCHAR(10)
                )
            `);

            // Enhanced prefunded wallets with seed phrase encryption
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS prefunded_wallets (
                    id SERIAL PRIMARY KEY,
                    wallet_address TEXT NOT NULL UNIQUE,
                    public_key TEXT NOT NULL,
                    private_key_hash TEXT NOT NULL,
                    seed_phrase_encrypted TEXT NOT NULL,
                    funded_amount DECIMAL(18,9) DEFAULT 0.02,
                    assigned_to_telegram_id BIGINT,
                    status TEXT DEFAULT 'available',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    assigned_at TIMESTAMP,
                    verified_at TIMESTAMP,
                    return_transaction_hash TEXT
                )
            `);

            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS verification_sessions (
                    id SERIAL PRIMARY KEY,
                    telegram_id BIGINT NOT NULL,
                    session_token TEXT NOT NULL UNIQUE,
                    wallet_address TEXT,
                    document_data TEXT,
                    status TEXT DEFAULT 'active',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
                )
            `);

            // Enhanced age credentials
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS age_credentials (
                    id SERIAL PRIMARY KEY,
                    telegram_id BIGINT NOT NULL,
                    age_bucket TEXT NOT NULL,
                    country TEXT NOT NULL,
                    region TEXT,
                    credential_hash TEXT NOT NULL,
                    wallet_address TEXT NOT NULL,
                    return_transaction_hash TEXT NOT NULL,
                    verification_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '2 years'),
                    is_active BOOLEAN DEFAULT true,
                    cost_stars INTEGER DEFAULT 250
                )
            `);

            // NEW: Affiliate system for 60/40 split
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS affiliates (
                    id SERIAL PRIMARY KEY,
                    telegram_id BIGINT REFERENCES users(telegram_id),
                    affiliate_code VARCHAR(50) UNIQUE NOT NULL,
                    total_referrals INTEGER DEFAULT 0,
                    total_earnings_stars INTEGER DEFAULT 0,
                    conversion_rate DECIMAL(5,2) DEFAULT 0.00,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT true
                )
            `);

            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS referrals (
                    id SERIAL PRIMARY KEY,
                    affiliate_id INTEGER REFERENCES affiliates(id),
                    referred_user_id BIGINT REFERENCES users(telegram_id),
                    commission_stars INTEGER NOT NULL,
                    verification_id INTEGER REFERENCES age_credentials(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    paid_at TIMESTAMP
                )
            `);

            // NEW: Payment tracking for 250 Stars
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS payments (
                    id SERIAL PRIMARY KEY,
                    telegram_id BIGINT REFERENCES users(telegram_id),
                    amount_stars INTEGER NOT NULL,
                    payment_type VARCHAR(50) NOT NULL,
                    telegram_payment_id VARCHAR(255),
                    status VARCHAR(20) DEFAULT 'pending',
                    verification_id INTEGER REFERENCES age_credentials(id),
                    affiliate_id INTEGER REFERENCES affiliates(id),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    confirmed_at TIMESTAMP
                )
            `);

            // NEW: Analytics for business intelligence
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS analytics (
                    id SERIAL PRIMARY KEY,
                    event_type VARCHAR(50) NOT NULL,
                    telegram_id BIGINT,
                    data JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    session_id VARCHAR(255)
                )
            `);

            // NEW: Revenue tracking
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS revenue_stats (
                    id SERIAL PRIMARY KEY,
                    date DATE UNIQUE NOT NULL,
                    total_revenue_stars INTEGER DEFAULT 0,
                    total_verifications INTEGER DEFAULT 0,
                    unique_users INTEGER DEFAULT 0,
                    avg_verification_time_seconds INTEGER DEFAULT 0,
                    top_countries JSONB,
                    conversion_rate DECIMAL(5,2) DEFAULT 0.00
                )
            `);

            logger.info('✅ PostgreSQL database initialized successfully');
        } catch (error) {
            logger.error('❌ Database initialization failed:', error);
            throw error;
        }
    }

    // Enhanced encryption for seed phrases
    encryptSeedPhrase(seedPhrase) {
        const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
        let encrypted = cipher.update(seedPhrase, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    decryptSeedPhrase(encryptedSeedPhrase) {
        const decipher = crypto.createDecipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
        let decrypted = decipher.update(encryptedSeedPhrase, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    hashPrivateKey(privateKey) {
        return crypto.createHash('sha256')
            .update(privateKey + process.env.ENCRYPTION_KEY)
            .digest('hex');
    }

    async createSession(telegramId) {
        const sessionToken = crypto.randomBytes(32).toString('hex');
        
        const result = await this.pool.query(
            'INSERT INTO verification_sessions (telegram_id, session_token) VALUES ($1, $2) RETURNING id',
            [telegramId, sessionToken]
        );
        
        return sessionToken;
    }

    async getSession(sessionToken) {
        const result = await this.pool.query(
            'SELECT * FROM verification_sessions WHERE session_token = $1 AND status = $2 AND expires_at > CURRENT_TIMESTAMP',
            [sessionToken, 'active']
        );
        
        return result.rows[0];
    }

    // Enhanced wallet storage with seed phrase encryption
    async storePreFundedWallet(walletData, telegramId) {
        const encryptedSeedPhrase = this.encryptSeedPhrase(walletData.seedPhrase);
        
        const result = await this.pool.query(`
            INSERT INTO prefunded_wallets (
                wallet_address, public_key, private_key_hash, seed_phrase_encrypted,
                funded_amount, assigned_to_telegram_id, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `, [
            walletData.address,
            walletData.publicKey,
            this.hashPrivateKey(walletData.privateKey),
            encryptedSeedPhrase,
            walletData.fundedAmount,
            telegramId,
            'assigned'
        ]);
        
        return result.rows[0].id;
    }

    // Enhanced verification result with affiliate processing
    async storeVerificationResult(data) {
        const client = await this.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Update user
            await client.query(`
                INSERT INTO users (telegram_id, username, verification_status, verification_count, total_spent_stars, updated_at)
                VALUES ($1, $2, $3, 1, 250, CURRENT_TIMESTAMP)
                ON CONFLICT (telegram_id) DO UPDATE SET
                    username = EXCLUDED.username,
                    verification_status = EXCLUDED.verification_status,
                    verification_count = users.verification_count + 1,
                    total_spent_stars = users.total_spent_stars + 250,
                    updated_at = EXCLUDED.updated_at
            `, [data.telegramId, data.username, 'verified']);
            
            // Store age credential
            const credResult = await client.query(`
                INSERT INTO age_credentials (
                    telegram_id, age_bucket, country, region,
                    credential_hash, wallet_address, return_transaction_hash,
                    verification_date, is_active, cost_stars
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, true, 250)
                RETURNING id
            `, [
                data.telegramId, data.ageBucket, data.country,
                data.region, data.credentialHash, data.walletAddress,
                data.returnTransactionHash
            ]);
            
            const verificationId = credResult.rows[0].id;
            
            // Store payment record
            await client.query(`
                INSERT INTO payments (telegram_id, amount_stars, payment_type, verification_id, status, confirmed_at)
                VALUES ($1, 250, 'verification', $2, 'confirmed', CURRENT_TIMESTAMP)
            `, [data.telegramId, verificationId]);
            
            // Process affiliate if exists
            if (data.affiliateCode) {
                await this.processAffiliatePayout(client, verificationId, data.affiliateCode);
            }
            
            await client.query('COMMIT');
            logger.info(`✅ Verification result stored for user ${data.telegramId}`);
            
            return verificationId;
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // NEW: Affiliate payout processing (60/40 split)
    async processAffiliatePayout(client, verificationId, affiliateCode) {
        // Find affiliate
        const affiliate = await client.query(`
            SELECT id, telegram_id FROM affiliates WHERE affiliate_code = $1 AND is_active = true
        `, [affiliateCode]);

        if (affiliate.rows.length > 0) {
            const affiliateId = affiliate.rows[0].id;
            const commissionStars = 150; // $1.50 = 150 stars (60% of 250)

            // Create referral record
            await client.query(`
                INSERT INTO referrals (affiliate_id, commission_stars, verification_id, paid_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            `, [affiliateId, commissionStars, verificationId]);

            // Update affiliate stats
            await client.query(`
                UPDATE affiliates SET 
                    total_referrals = total_referrals + 1,
                    total_earnings_stars = total_earnings_stars + $1
                WHERE id = $2
            `, [commissionStars, affiliateId]);

            // Update user earnings
            await client.query(`
                UPDATE users SET 
                    affiliate_earnings_stars = affiliate_earnings_stars + $1
                WHERE telegram_id = $2
            `, [commissionStars, affiliate.rows[0].telegram_id]);

            logger.info(`✅ Affiliate payout processed: ${commissionStars} stars to affiliate ${affiliateCode}`);
        }
    }

    // NEW: Analytics tracking
    async trackEvent(eventType, telegramId, data = {}, sessionId = null) {
        await this.pool.query(`
            INSERT INTO analytics (event_type, telegram_id, data, session_id)
            VALUES ($1, $2, $3, $4)
        `, [eventType, telegramId, JSON.stringify(data), sessionId]);
    }

    // NEW: Create affiliate
    async createAffiliate(telegramId, affiliateCode) {
        const result = await this.pool.query(`
            INSERT INTO affiliates (telegram_id, affiliate_code)
            VALUES ($1, $2)
            ON CONFLICT (affiliate_code) DO NOTHING
            RETURNING *
        `, [telegramId, affiliateCode]);
        
        return result.rows[0];
    }

    // NEW: Get wallet with decrypted seed phrase
    async getWalletWithSeedPhrase(walletAddress) {
        const result = await this.pool.query(`
            SELECT * FROM prefunded_wallets WHERE wallet_address = $1
        `, [walletAddress]);
        
        if (result.rows.length > 0) {
            const wallet = result.rows[0];
            wallet.seed_phrase = this.decryptSeedPhrase(wallet.seed_phrase_encrypted);
            return wallet;
        }
        return null;
    }

    // NEW: Business intelligence
    async getDailyStats(date = new Date()) {
        const dateStr = date.toISOString().split('T')[0];
        
        const stats = await this.pool.query(`
            SELECT 
                COUNT(DISTINCT ac.telegram_id) as unique_users,
                COUNT(ac.id) as total_verifications,
                SUM(ac.cost_stars) as total_revenue_stars,
                AVG(EXTRACT(EPOCH FROM (ac.verification_date - u.created_at))) as avg_verification_time,
                json_agg(DISTINCT ac.country) as countries
            FROM age_credentials ac
            JOIN users u ON ac.telegram_id = u.telegram_id
            WHERE DATE(ac.verification_date) = $1
        `, [dateStr]);

        return stats.rows[0];
    }

    async close() {
        await this.pool.end();
    }
}

module.exports = new AgenonymousDatabase();
