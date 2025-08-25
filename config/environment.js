// Environment Configuration
// Override base URLs for production if needed

const ENV_CONFIG = {
    // Development (localhost)
    development: {
        baseUrl: null, // Will use window.location
        apiBaseUrl: null, // Will use window.location + /api
        webSocketUrl: null // Will use window.location
    },
    
    // Production (custom domain)
    production: {
        // Uncomment and modify these for production
        // baseUrl: 'https://yourdomain.com',
        // apiBaseUrl: 'https://yourdomain.com/api',
        // webSocketUrl: 'wss://yourdomain.com'
        
        // Or leave as null to use automatic detection
        baseUrl: null,
        apiBaseUrl: null,
        webSocketUrl: null
    }
};

// Get current environment
const getCurrentEnv = () => {
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'development';
        }
        return 'production';
    }
    return 'development';
};

// Export configuration
if (typeof window !== 'undefined') {
    window.ENV_CONFIG = ENV_CONFIG;
    window.getCurrentEnv = getCurrentEnv;
    
    console.log('🌍 Environment Configuration loaded:', {
        currentEnv: getCurrentEnv(),
        config: ENV_CONFIG[getCurrentEnv()]
    });
}
