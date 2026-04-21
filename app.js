require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

// Import modul database dan service
const { testConnection, initDatabase, whatsappSessionQueries } = require('./db');
const WhatsAppService = require('./services/WhatsAppService');
const socket = require('./socket');
const { config, validateConfig } = require('./config/config');

// Import modular routes
const whatsappRoutes = require('./routes/api/whatsappRoutes');
const contactRoutes = require('./routes/api/contactRoutes');
const chatRoutes = require('./routes/api/chatRoutes');
const userRoutes = require('./routes/api/userRoutes');
const broadcastRoutes = require('./routes/api/broadcastRoutes');
const sessionRoutes = require('./routes/api/sessionRoutes');
const dashboardRoutes = require('./routes/api/dashboardRoutes');
const viewRoutes = require('./routes/viewRoutes');

// Validate configuration at startup
validateConfig();

// Inisialisasi Express
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'whatsapp-api-session-secret',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Inisialisasi Server dan Socket.IO
const http = require('http').createServer(app);
const io = socket.init(http);
WhatsAppService.setIo(io); // Berikan io instance ke WhatsAppService

// Aset statis
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/config', express.static(path.join(__dirname, 'config')));

// Base health check
app.get('/health', (req, res) => res.json({ status: 'UP', timestamp: new Date() }));

// Register Routes
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/users', userRoutes);
app.use('/api/whatsapp', broadcastRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/', viewRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: config.server?.nodeEnv === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    if (req.path.startsWith('/api/') || req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(404).json({
            success: false,
            message: 'Endpoint not found'
        });
    }
    
    // Render the beautiful UX NXL 404 Page for browser requests
    res.status(404).render('404');
});

// Initialize and Start Server
const port = process.env.PORT || 3000;

const initializeApp = async () => {
    try {
        console.log('🚀 Initializing modular WhatsApp Web API...');
        
        // 1. Test database connection
        const dbConnected = await testConnection();
        if (!dbConnected) {
            console.error('❌ Database connection failed. Exiting...');
            process.exit(1);
        }

        // 2. Initialize database tables
        await initDatabase();

        // 3. Load all WhatsApp sessions from database
        const sessions = await whatsappSessionQueries.getAllSessions();
        console.log(`🔍 Found ${sessions.length} sessions in database. Loading...`);
        
        for (const session of sessions) {
            try {
                // Non-blocking initialization
                WhatsAppService.createWhatsAppClient(session).catch(err => {
                    console.error(`Failed to init session ${session.session_id}:`, err.message);
                });
                // Small delay to prevent CPU spike
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err) {
                console.error(`Error processing session ${session.session_id}:`, err.message);
            }
        }

        // 4. Start HTTP Server
        http.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
            console.log('✅ Application initialized successfully!');
        });

    } catch (error) {
        console.error('❌ Error during application initialization:', error);
        process.exit(1);
    }
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);
    try {
        const clients = WhatsAppService.getAllClients();
        for (const sessionId in clients) {
            if (clients[sessionId].client) {
                console.log(`Closing client ${sessionId}...`);
                await clients[sessionId].client.destroy();
            }
        }
        process.exit(0);
    } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
    }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

initializeApp();
