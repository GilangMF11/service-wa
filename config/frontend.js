// Frontend Configuration
// This file provides dynamic configuration for frontend

const getBaseUrl = () => {
    // Check if environment config overrides base URL
    if (window.ENV_CONFIG && window.getCurrentEnv) {
        const env = window.getCurrentEnv();
        const envConfig = window.ENV_CONFIG[env];
        
        if (envConfig && envConfig.baseUrl) {
            return envConfig.baseUrl;
        }
    }
    
    // Get base URL from window.location
    const protocol = window.location.protocol;
    const host = window.location.host;
    return `${protocol}//${host}`;
};

const getApiBaseUrl = () => {
    // Check if environment config overrides API base URL
    if (window.ENV_CONFIG && window.getCurrentEnv) {
        const env = window.getCurrentEnv();
        const envConfig = window.ENV_CONFIG[env];
        
        if (envConfig && envConfig.apiBaseUrl) {
            return envConfig.apiBaseUrl;
        }
    }
    
    // Get API base URL
    return `${getBaseUrl()}/api`;
};

const getWebSocketUrl = () => {
    // Check if environment config overrides WebSocket URL
    if (window.ENV_CONFIG && window.getCurrentEnv) {
        const env = window.getCurrentEnv();
        const envConfig = window.ENV_CONFIG[env];
        
        if (envConfig && envConfig.webSocketUrl) {
            return envConfig.webSocketUrl;
        }
    }
    
    // Get WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}`;
};

// Export configuration
window.AppConfig = {
    baseUrl: getBaseUrl(),
    apiBaseUrl: getApiBaseUrl(),
    webSocketUrl: getWebSocketUrl(),
    isDevelopment: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    isProduction: window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
};

// Helper functions
window.getBaseUrl = getBaseUrl;
window.getApiBaseUrl = getApiBaseUrl;
window.getWebSocketUrl = getWebSocketUrl;

console.log('🌐 App Configuration loaded:', window.AppConfig);
