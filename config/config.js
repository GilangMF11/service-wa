// config/config.js
require('dotenv').config();

const config = {
    // Server Configuration
    server: {
        port: parseInt(process.env.PORT) || 3000,
        nodeEnv: process.env.NODE_ENV || 'development',
        corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000'
    },

    // Database Configuration
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        name: process.env.DB_NAME || 'whatsapp_api',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        ssl: process.env.NODE_ENV === 'production',
        maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000
    },

    // JWT Configuration
    jwt: {
        secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        algorithm: 'HS256'
    },

    // Security Configuration
    security: {
        bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10,
        sessionSecret: process.env.SESSION_SECRET || 'your-session-secret'
    },

    // WhatsApp Configuration
    whatsapp: {
        sessionTimeout: parseInt(process.env.WHATSAPP_SESSION_TIMEOUT) || 300000, // 5 minutes
        qrTimeout: parseInt(process.env.WHATSAPP_QR_TIMEOUT) || 60000, // 1 minute
        maxSessions: parseInt(process.env.WHATSAPP_MAX_SESSIONS) || 50,
        retryAttempts: parseInt(process.env.WHATSAPP_RETRY_ATTEMPTS) || 3
    },

    // Upload Configuration
    upload: {
        maxSize: parseInt(process.env.UPLOAD_MAX_SIZE) || 10485760, // 10MB
        allowedTypes: process.env.UPLOAD_ALLOWED_TYPES 
            ? process.env.UPLOAD_ALLOWED_TYPES.split(',')
            : ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'],
        uploadDir: process.env.UPLOAD_DIR || './uploads',
        tempDir: process.env.TEMP_DIR || './temp'
    },

    // Rate Limiting Configuration
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
        skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true',
        skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'true'
    },

    // Broadcast Configuration
    broadcast: {
        defaultDelay: parseInt(process.env.BROADCAST_DEFAULT_DELAY) || 1000, // 1 second
        maxDelay: parseInt(process.env.BROADCAST_MAX_DELAY) || 10000, // 10 seconds
        minDelay: parseInt(process.env.BROADCAST_MIN_DELAY) || 500, // 0.5 seconds
        maxBatchSize: parseInt(process.env.BROADCAST_MAX_BATCH_SIZE) || 1000,
        retryAttempts: parseInt(process.env.BROADCAST_RETRY_ATTEMPTS) || 3,
        retryDelay: parseInt(process.env.BROADCAST_RETRY_DELAY) || 5000 // 5 seconds
    },

    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
        logDir: process.env.LOG_DIR || './logs',
        maxFileSize: process.env.LOG_MAX_FILE_SIZE || '20m',
        maxFiles: parseInt(process.env.LOG_MAX_FILES) || 14
    },

    // Email Configuration (untuk notifications)
    email: {
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASSWORD,
        from: process.env.EMAIL_FROM || 'noreply@whatsapp-api.com'
    },

    // Redis Configuration (untuk queue/cache jika diperlukan)
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB) || 0,
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'whatsapp_api:'
    },

    // Feature Flags
    features: {
        enableBroadcast: process.env.ENABLE_BROADCAST !== 'false',
        enableFileUpload: process.env.ENABLE_FILE_UPLOAD !== 'false',
        enableUserRegistration: process.env.ENABLE_USER_REGISTRATION !== 'false',
        enableAnalytics: process.env.ENABLE_ANALYTICS === 'true',
        enableNotifications: process.env.ENABLE_NOTIFICATIONS === 'true'
    },

    // Development Configuration
    development: {
        enableDebug: process.env.ENABLE_DEBUG === 'true',
        enableHotReload: process.env.ENABLE_HOT_RELOAD === 'true',
        seedDatabase: process.env.SEED_DATABASE === 'true'
    }
};

// Validation function untuk memastikan konfigurasi penting tersedia
const validateConfig = () => {
    const requiredVars = [
        'DB_HOST',
        'DB_NAME', 
        'DB_USER',
        'DB_PASSWORD',
        'JWT_SECRET'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        console.error('❌ Missing required environment variables:', missingVars.join(', '));
        console.error('💡 Please check your .env file');
        process.exit(1);
    }

    // Warn about development defaults
    if (config.server.nodeEnv === 'production') {
        if (process.env.JWT_SECRET === 'your-super-secret-jwt-key') {
            console.warn('⚠️  WARNING: Using default JWT secret in production!');
        }
        
        if (!config.database.ssl) {
            console.warn('⚠️  WARNING: SSL is disabled for database in production!');
        }
    }

    console.log('✅ Configuration validated successfully');
    console.log(`🚀 Running in ${config.server.nodeEnv} mode`);
};

// Export config dan validation function
module.exports = {
    config,
    validateConfig
};