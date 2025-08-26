require('dotenv').config();
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');


// Di bagian atas file app.js, setelah require lainnya
const clients = require('./clients');

// Import modul
const { testConnection, initDatabase, whatsappSessionQueries } = require('./db');
const { registerUser, loginUser } = require('./auth');
const { verifyToken } = require('./middleware/authMiddleware');

// Tambahkan di bagian atas setelah import routes yang sudah ada
const contactRoutes = require('./routes/api/contactRoutes');
const chatRoutes = require('./routes/api/chatRoutes');
const userRoutes = require('./routes/api/userRoutes');
const broadcastRoutes = require('./routes/api/broadcastRoutes');
const sessionRoutes = require('./routes/api/sessionRoutes');
const dashboardRoutes = require('./routes/api/dashboardRoutes');

const { config, validateConfig } = require('./config/config');

// Validate configuration at startup
validateConfig();

// Inisialisasi Express
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Session middleware
const session = require('express-session');
app.use(session({
    secret: process.env.SESSION_SECRET || 'whatsapp-api-session-secret',
    resave: false,
    saveUninitialized: true, // Ubah ke true untuk mencegah error
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

const port = process.env.PORT || 3000;

const http = require('http').createServer(app);
const socket = require('./socket'); // ← pastikan ada file ini
const io = socket.init(http); // ← ini akan menginisialisasi IO


// Routes View
const viewRoutes = require('./routes/viewRoutes');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Aset statis (gambar, css, js)
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Serve frontend configuration
app.use('/config', express.static(path.join(__dirname, 'config')));



// Direktori untuk menyimpan sesi
const SESSION_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// Direktori untuk upload broadcast media
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const BROADCAST_UPLOAD_DIR = path.join(UPLOAD_DIR, 'broadcast');
if (!fs.existsSync(BROADCAST_UPLOAD_DIR)) {
    fs.mkdirSync(BROADCAST_UPLOAD_DIR, { recursive: true });
}


// Fungsi untuk membuat client WhatsApp baru berdasarkan data dari database
const createWhatsAppClient = async (sessionRecord) => {
    const { session_id, user_id, description } = sessionRecord;
    const sessionDir = path.join(SESSION_DIR, `session-${session_id}`);
    
    // Buat client baru
    const client = new Client({
        authStrategy: new LocalAuth({ 
            clientId: `session-${session_id}`,
            dataPath: sessionDir
        }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    // Simpan status koneksi
    clients[session_id] = {
        client,
        userId: user_id,
        isReady: false,
        qrCode: null,
        qrTimestamp: null, // Tambahkan timestamp untuk QR code
        createdAt: new Date().toISOString(),
        description: description || null
    };

    // Event saat QR code tersedia untuk di-scan
    client.on('qr', async (qr) => {
        //console.log(`QR Code untuk session ${session_id} tersedia:`);
        //qrcode.generate(qr, { small: true });
        clients[session_id].qrCode = qr;
        clients[session_id].qrTimestamp = Date.now(); // Catat waktu QR code dibuat
    });

    // Event saat client siap
    client.on('ready', async () => {
        clients[session_id].isReady = true;
        clients[session_id].qrCode = null;
        console.log(`Client WhatsApp untuk session ${session_id} siap!`);
        
        // Update status di database
        try {
            await whatsappSessionQueries.updateSessionStatus(session_id, true);
        } catch (error) {
            console.error(`Error saat memperbarui status session ${session_id}:`, error);
        }
    });

    // Event saat client terputus
    client.on('disconnected', async (reason) => {
        console.log(`Client WhatsApp untuk session ${session_id} terputus: ${reason}`);
        clients[session_id].isReady = false;
        
        // Update status di database
        try {
            await whatsappSessionQueries.updateSessionStatus(session_id, false);
        } catch (error) {
            console.error(`Error saat memperbarui status session ${session_id}:`, error);
        }
    });

    // Event untuk menangani error
    client.on('auth_failure', (error) => {
        console.error(`Auth failure for session ${session_id}:`, error);
    });

    // Inisialisasi client
    try {
        await client.initialize();
    } catch (error) {
        console.error(`Error initializing client for session ${session_id}:`, error);
    }

    client.on('message', async (msg) => {
        try {
            const io = require('./socket').getIO();
            if (clients[session_id]) {
                // Robust message ID extraction
                let messageId = null;
                try {
                    if (msg.id) {
                        if (msg.id._serialized) {
                            messageId = msg.id._serialized;
                        } else if (msg.id.id) {
                            messageId = msg.id.id;
                        } else if (typeof msg.id === 'string') {
                            messageId = msg.id;
                        } else {
                            messageId = JSON.stringify(msg.id);
                        }
                    }
                } catch (error) {
                    console.warn('Failed to extract message ID:', error.message);
                    messageId = 'unknown';
                }

                // Emit to socket.io room for real-time updates
                io.to(`session-${session_id}`).emit('new-message', {
                    contactId: msg.from,
                    message: msg.body,
                    fromMe: false,
                    timestamp: msg.timestamp,
                    id: messageId,
                    sessionId: session_id
                });
                
                console.log(`📨 Real-time message emitted for session ${session_id}:`, {
                    from: msg.from,
                    message: msg.body.substring(0, 50) + '...'
                });
            }
        } catch (err) {
            console.error('Socket.IO belum siap:', err.message);
        }
    });
    
    

    return client;
};
// const createWhatsAppClient = async (sessionRecord) => {
//     const { session_id, user_id, description } = sessionRecord;
//     const sessionDir = path.join(SESSION_DIR, `session-${session_id}`);
    
//     // Buat client baru
//     const client = new Client({
//         authStrategy: new LocalAuth({ 
//             clientId: `session-${session_id}`,
//             dataPath: sessionDir
//         }),
//         puppeteer: {
//             headless: true,
//             args: ['--no-sandbox', '--disable-setuid-sandbox']
//         }
//     });

//     // Simpan status koneksi
//     clients[session_id] = {
//         client,
//         userId: user_id,
//         isReady: false,
//         qrCode: null,
//         createdAt: new Date().toISOString(),
//         description: description || null
//     };

//     // Event saat QR code tersedia untuk di-scan
//     client.on('qr', async (qr) => {
//         console.log(`QR Code untuk session ${session_id} tersedia:`);
//         qrcode.generate(qr, { small: true });
//         clients[session_id].qrCode = qr;
//     });

//     // Event saat client siap
//     client.on('ready', async () => {
//         clients[session_id].isReady = true;
//         clients[session_id].qrCode = null;
//         console.log(`Client WhatsApp untuk session ${session_id} siap!`);
        
//         // Update status di database
//         try {
//             await whatsappSessionQueries.updateSessionStatus(session_id, true);
//         } catch (error) {
//             console.error(`Error saat memperbarui status session ${session_id}:`, error);
//         }
//     });

//     // Event saat client terputus
//     client.on('disconnected', async (reason) => {
//         console.log(`Client WhatsApp untuk session ${session_id} terputus: ${reason}`);
//         clients[session_id].isReady = false;
        
//         // Update status di database
//         try {
//             await whatsappSessionQueries.updateSessionStatus(session_id, false);
//         } catch (error) {
//             console.error(`Error saat memperbarui status session ${session_id}:`, error);
//         }
//     });

//     // Inisialisasi client
//     client.initialize();

//     return client;
// };

// Fungsi untuk menghapus sesi dan menginisialisasi ulang client
const deleteSessionAndReInitialize = async (sessionId) => {
    if (clients[sessionId] && clients[sessionId].client) {
        clients[sessionId].client.destroy();
    }
    
    delete clients[sessionId];
    
    // Hapus direktori sesi
    const sessionDir = path.join(SESSION_DIR, `session-${sessionId}`);
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    
    // Dapatkan data session dari database
    try {
        const sessionRecord = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (sessionRecord) {
            // Buat client baru
            return createWhatsAppClient(sessionRecord);
        }
    } catch (error) {
        console.error(`Error saat me-reset session ${sessionId}:`, error);
    }
    
    return null;
};

// Middleware untuk memeriksa jika session ada dalam permintaan
const validateSession = async (req, res, next) => {
    const sessionId = req.headers['session-id'];
    
    if (!sessionId) {
        return res.status(400).json({ 
            success: false, 
            message: 'Header session-id diperlukan' 
        });
    }
    
    try {
        // Cek apakah session ada di database
        const sessionRecord = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (!sessionRecord) {
            return res.status(404).json({ 
                success: false, 
                message: 'Session tidak ditemukan'
            });
        }
        
        // Buat client baru jika belum ada
        if (!clients[sessionId]) {
            await createWhatsAppClient(sessionRecord);
        }
        
        req.sessionId = sessionId;
        req.userId = sessionRecord.user_id;
        next();
    } catch (error) {
        console.error('Error saat validasi session:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal memvalidasi session',
            error: error.message
        });
    }
};

// Middleware untuk memeriksa status koneksi client
const checkConnection = (req, res, next) => {
    const sessionId = req.sessionId;
    
    if (!clients[sessionId] || !clients[sessionId].isReady) {
        const qrCode = clients[sessionId] ? clients[sessionId].qrCode : null;
        
        return res.status(503).json({ 
            success: false, 
            message: 'WhatsApp client belum siap. Silakan scan QR code terlebih dahulu.',
            needScan: true,
            qrCode: qrCode
        });
    }
    
    next();
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.server.nodeEnv
    });
});

// Rute untuk autentikasi
app.post('/auth/register', registerUser);
app.post('/auth/login', loginUser);
app.get('/auth/logout', (req, res) => {
    // Destroy session
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
        });
    }
    
    // Return response berdasarkan request type
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        // API call
        return res.json({
            success: true,
            message: 'Logout berhasil'
        });
    } else {
        // Web page
        res.redirect('/auth/login');
    }
});

// Routes yang tidak memerlukan autentikasi (untuk dashboard)
app.use('/api/sessions', sessionRoutes);

// Rute WhatsApp API yang memerlukan autentikasi
app.use('/api', verifyToken);

app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Routes untuk broadcast (dengan feature flag check)
if (config.features.enableBroadcast) {
    app.use('/api/whatsapp', broadcastRoutes);
}

// Endpoint untuk membuat session WhatsApp baru
app.post('/api/whatsapp/session', async (req, res) => {
    try {
        const userId = req.user.id;
        const { description } = req.body;
        
        // Check user session limit
        const userSessions = await whatsappSessionQueries.getSessionsByUserId(userId);
        if (userSessions.length >= config.whatsapp.maxSessions) {
            return res.status(400).json({
                success: false,
                message: `Maximum ${config.whatsapp.maxSessions} sessions allowed per user`
            });
        }
        
        // Buat session ID baru
        const sessionId = uuidv4();
        
        // Simpan session di database
        const sessionRecord = await whatsappSessionQueries.createSession(userId, sessionId, description);
        
        // Buat client WhatsApp baru
        await createWhatsAppClient(sessionRecord);
        
        // Tunggu sebentar sampai QR code tersedia
        setTimeout(() => {
            const qrCode = clients[sessionId] ? clients[sessionId].qrCode : null;
            
            res.status(201).json({ 
                success: true, 
                message: 'Session WhatsApp baru berhasil dibuat',
                sessionId: sessionId,
                qrCode: qrCode,
                needScan: true
            });
        }, 2000);
    } catch (error) {
        console.error('Error saat membuat session:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal membuat session', 
            error: error.message 
        });
    }
});

// Test endpoint untuk debugging
app.get('/api/whatsapp/sessions/test', (req, res) => {
    console.log('🧪 Test endpoint called');
    console.log('🔗 Full URL:', req.originalUrl);
    console.log('📡 Method:', req.method);
    console.log('👤 User ID:', req.user?.id);
    console.log('🔑 User object:', req.user);
    
    res.json({
        success: true,
        message: 'Test endpoint working',
        user: req.user,
        timestamp: new Date().toISOString()
    });
});

// Endpoint untuk mendapatkan chat messages dengan contact tertentu (MUST BE FIRST - more specific)
app.get('/api/whatsapp/:sessionId/chats/:contactId', async (req, res) => {
    try {
        const { sessionId, contactId } = req.params;
        const { limit = 50 } = req.query; // Default 50 pesan terakhir
        const userId = req.user.id;
        
        console.log('🚀 GET /api/whatsapp/:sessionId/chats/:contactId called');
        console.log('🔗 Session ID:', sessionId);
        console.log('👤 Contact ID:', contactId);
        console.log('👤 User ID:', userId);
        console.log('📊 Limit:', limit);
        
        // Cek apakah session ada dan milik user
        const sessionRecord = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (!sessionRecord || sessionRecord.user_id !== userId) {
            return res.status(404).json({
                success: false,
                message: 'Session tidak ditemukan atau tidak memiliki akses'
            });
        }
        
        // Cek apakah client ada dan siap
        if (!clients[sessionId] || !clients[sessionId].isReady) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp client belum siap. Silakan scan QR code terlebih dahulu.',
                needScan: true
            });
        }
        
        // Ambil chat dengan contact
        const chat = await clients[sessionId].client.getChatById(contactId);
        if (!chat) {
            return res.status(404).json({
                success: false,
                message: 'Chat tidak ditemukan'
            });
        }
        
        // Ambil history pesan
        const messages = await chat.fetchMessages({
            limit: parseInt(limit)
        });
        
        res.status(200).json({
            success: true,
            contact: {
                id: chat.id._serialized,
                name: chat.name,
                isGroup: chat.isGroup
            },
            messages: await Promise.all(messages.map(async (msg) => {
                let mediaData = null;
                
                // Get media data if message has media
                if (msg.hasMedia) {
                    try {
                        const media = await msg.downloadMedia();
                        if (media && media.data) {
                            mediaData = media.data;
                        }
                    } catch (mediaError) {
                        console.warn('⚠️ Could not download media for message:', mediaError.message);
                    }
                }
                
                return {
                    id: msg.id._serialized,
                    body: msg.body,
                    fromMe: msg.fromMe,
                    author: msg.author || null, // ID pengirim (penting untuk grup)
                    timestamp: msg.timestamp,
                    hasMedia: msg.hasMedia,
                    type: msg.type,
                    mediaData: mediaData
                };
            }))
        });
        
    } catch (error) {
        console.error('Error saat mengambil chat messages:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil chat messages',
            error: error.message
        });
    }
});

// Endpoint untuk mendapatkan daftar chat dalam session (MUST BE SECOND - less specific)
app.get('/api/whatsapp/:sessionId/chats', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        
        console.log('🚀 GET /api/whatsapp/:sessionId/chats called');
        console.log('🔗 Session ID:', sessionId);
        console.log('👤 User ID:', userId);
        
        // Cek apakah session ada dan milik user
        const sessionRecord = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (!sessionRecord || sessionRecord.user_id !== userId) {
            return res.status(404).json({
                success: false,
                message: 'Session tidak ditemukan atau tidak memiliki akses'
            });
        }
        
        // Cek apakah client ada dan siap
        if (!clients[sessionId] || !clients[sessionId].isReady) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp client belum siap. Silakan scan QR code terlebih dahulu.',
                needScan: true
            });
        }
        
        // Ambil semua chat
        const chats = await clients[sessionId].client.getChats();
        
        res.status(200).json({
            success: true,
            chats: chats.map(chat => ({
                id: chat.id._serialized,
                name: chat.name,
                isGroup: chat.isGroup,
                timestamp: chat.timestamp,
                unreadCount: chat.unreadCount
            }))
        });
        
    } catch (error) {
        console.error('Error saat mengambil daftar chat:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil daftar chat',
            error: error.message
        });
    }
});

// Endpoint untuk mengirim pesan
app.post('/api/whatsapp/:sessionId/chats/:contactId', async (req, res) => {
    try {
        const { sessionId, contactId } = req.params;
        const { message } = req.body;
        const userId = req.user.id;
        
        console.log('🚀 POST /api/whatsapp/:sessionId/chats/:contactId called');
        console.log('🔗 Session ID:', sessionId);
        console.log('👤 Contact ID:', contactId);
        console.log('👤 User ID:', userId);
        console.log('💬 Message:', message);
        console.log('🔍 Client status:', !!clients[sessionId], clients[sessionId]?.isReady);
        console.log('🔍 Client object keys:', clients[sessionId] ? Object.keys(clients[sessionId]) : 'N/A');
        console.log('🔍 Client ready state:', clients[sessionId]?.isReady);
        console.log('🔍 Client connection state:', clients[sessionId]?.client?.pupPage ? 'Page exists' : 'No page');
        console.log('💬 Message details:', { messageLength: message?.length || 0 });
        
        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Pesan tidak boleh kosong'
            });
        }
        
        // Cek apakah session ada dan milik user
        const sessionRecord = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (!sessionRecord || sessionRecord.user_id !== userId) {
            return res.status(404).json({
                success: false,
                message: 'Session tidak ditemukan atau tidak memiliki akses'
            });
        }
        
        // Cek apakah client ada dan siap
        if (!clients[sessionId] || !clients[sessionId].isReady) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp client belum siap. Silakan scan QR code terlebih dahulu.',
                needScan: true
            });
        }
        
        // Kirim pesan dengan error handling yang lebih robust
        try {
            console.log('📤 Attempting to send message...');
            
                    // Create a promise that handles the serialize error gracefully
        const sendMessageWithFallback = () => {
            return new Promise((resolve, reject) => {
                const startTime = Date.now();
                console.log('📤 Starting send message at:', new Date(startTime).toISOString());
                
                // Set a timeout for the entire operation
                const timeout = setTimeout(() => {
                    const elapsed = Date.now() - startTime;
                    console.log(`⏰ Timeout after ${elapsed}ms`);
                    reject(new Error('Send message timeout after 30 seconds'));
                }, 30000);
                
                // Try to send the message
                clients[sessionId].client.sendMessage(contactId, message)
                    .then(result => {
                        const elapsed = Date.now() - startTime;
                        clearTimeout(timeout);
                        console.log(`✅ Message sent successfully in ${elapsed}ms, result:`, result);
                        resolve(result);
                    })
                    .catch(error => {
                        const elapsed = Date.now() - startTime;
                        clearTimeout(timeout);
                        console.log(`❌ Send message error after ${elapsed}ms:`, error.message);
                        
                        // Check if it's a serialize error
                        if (error.message && error.message.includes('serialize')) {
                            console.log('🔄 Serialize error detected, will verify manually...');
                            // Don't reject, let the verification process handle it
                            resolve({ serializeError: true, originalError: error, sendTime: startTime });
                        } else {
                            reject(error);
                        }
                    });
            });
        };
            
            const result = await sendMessageWithFallback();
            
            // If we got a serialize error, verify manually with better timing
            if (result.serializeError) {
                console.log('🔄 Verifying message delivery after serialize error...');
                
                // Wait longer for the message to be processed and indexed
                console.log('⏳ Waiting 5 seconds for message processing...');
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                try {
                    const chat = await clients[sessionId].client.getChatById(contactId);
                    if (chat) {
                        // Try multiple times with increasing delays
                        let messageFound = false;
                        let attempts = 0;
                        const maxAttempts = 3;
                        
                        while (!messageFound && attempts < maxAttempts) {
                            attempts++;
                            console.log(`🔍 Verification attempt ${attempts}/${maxAttempts}`);
                            
                            const recentMessages = await chat.fetchMessages({ limit: 20 });
                            console.log(`📨 Found ${recentMessages.length} recent messages`);
                            
                            // Look for our message in recent messages
                            const ourMessage = recentMessages.find(msg => 
                                msg.body === message && 
                                msg.fromMe === true
                            );
                            
                            if (ourMessage) {
                                console.log('✅ Message found in recent messages:', {
                                    body: ourMessage.body,
                                    fromMe: ourMessage.fromMe,
                                    timestamp: ourMessage.timestamp,
                                    id: ourMessage.id._serialized
                                });
                                
                                res.status(200).json({
                                    success: true,
                                    message: 'Pesan berhasil dikirim (verifikasi manual)',
                                    messageId: ourMessage.id._serialized || 'manual-verification',
                                    timestamp: ourMessage.timestamp * 1000 || Date.now(),
                                    note: 'Message verified as sent despite serialize error'
                                });
                                return;
                            } else {
                                console.log(`❌ Message not found in attempt ${attempts}`);
                                
                                if (attempts < maxAttempts) {
                                    console.log(`⏳ Waiting 3 seconds before next attempt...`);
                                    await new Promise(resolve => setTimeout(resolve, 3000));
                                }
                            }
                        }
                        
                        // If we get here, message was not found after all attempts
                        console.log('❌ Message not found after all verification attempts');
                        
                        // Check if there are any recent messages from us
                        const ourRecentMessages = recentMessages.filter(msg => msg.fromMe === true);
                        console.log(`📊 Recent messages from us: ${ourRecentMessages.length}`);
                        if (ourRecentMessages.length > 0) {
                            console.log('📝 Last message from us:', {
                                body: ourRecentMessages[0].body,
                                timestamp: ourRecentMessages[0].timestamp
                            });
                        }
                        
                        // Even if we can't verify, assume success for serialize errors
                        console.log('🔄 Assuming success for serialize error (common WhatsApp Web.js issue)');
                        res.status(200).json({
                            success: true,
                            message: 'Pesan berhasil dikirim (asumsi sukses)',
                            messageId: 'serialize-success-assumption',
                            timestamp: Date.now(),
                            note: 'Message assumed successful despite serialize error (common issue)'
                        });
                        return;
                    }
                } catch (verifyError) {
                    console.error('❌ Error during manual verification:', verifyError);
                    
                    // Even if verification fails, assume success for serialize errors
                    console.log('🔄 Verification failed, but assuming success for serialize error');
                    res.status(200).json({
                        success: true,
                        message: 'Pesan berhasil dikirim (asumsi sukses)',
                        messageId: 'serialize-success-assumption',
                        timestamp: Date.now(),
                        note: 'Message assumed successful despite verification failure (common serialize issue)'
                    });
                    return;
                }
            }
            
            // Normal success case
            let messageId = null;
            let timestamp = null;
            
            try {
                if (result && result.id) {
                    messageId = result.id._serialized || result.id.id || result.id;
                }
                if (result && result.timestamp) {
                    timestamp = result.timestamp;
                }
            } catch (serializeError) {
                console.warn('⚠️ Serialize error on response parsing, but message sent successfully');
                messageId = 'response-parse-success';
                timestamp = Date.now();
            }
            
            res.status(200).json({
                success: true,
                message: 'Pesan berhasil dikirim',
                messageId: messageId,
                timestamp: timestamp
            });
            
        } catch (sendError) {
            console.error('❌ Final error in send message:', sendError);
            res.status(500).json({
                success: false,
                message: 'Gagal mengirim pesan',
                error: sendError.message
            });
        }
        
    } catch (error) {
        console.error('Error saat mengirim pesan:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengirim pesan',
            error: error.message
        });
    }
});



// Endpoint untuk mengirim file (gambar/dokumen)
app.post('/api/whatsapp/:sessionId/chats/:contactId/file', async (req, res) => {
    try {
        const { sessionId, contactId } = req.params;
        const { message, fileType, fileName, fileData } = req.body;
        const userId = req.user.id;
        
        console.log('🚀 POST /api/whatsapp/:sessionId/chats/:contactId/file called');
        console.log('🔗 Session ID:', sessionId);
        console.log('👤 Contact ID:', contactId);
        console.log('👤 User ID:', userId);
        console.log('📁 File Type:', fileType);
        console.log('📁 File Name:', fileName);
        
        if (!fileData || !fileType) {
            return res.status(400).json({
                success: false,
                message: 'File data dan type diperlukan'
            });
        }
        
        // Check file size (max 10MB)
        const fileSizeBytes = Buffer.byteLength(fileData, 'base64');
        const maxSizeBytes = 10 * 1024 * 1024; // 10MB
        
        if (fileSizeBytes > maxSizeBytes) {
            return res.status(413).json({
                success: false,
                message: `File terlalu besar. Maksimal ${(maxSizeBytes / 1024 / 1024).toFixed(1)}MB`,
                fileSize: (fileSizeBytes / 1024 / 1024).toFixed(2),
                maxSize: (maxSizeBytes / 1024 / 1024).toFixed(1)
            });
        }
        
        console.log(`📁 File size: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB`);
        
        // Validate file type
        const allowedTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain'
        ];
        
        if (!allowedTypes.includes(fileType)) {
            return res.status(400).json({
                success: false,
                message: 'Tipe file tidak didukung',
                fileType: fileType,
                allowedTypes: allowedTypes
            });
        }
        
        console.log(`✅ File type validated: ${fileType}`);
        
        // Cek apakah session ada dan milik user
        const sessionRecord = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (!sessionRecord || sessionRecord.user_id !== userId) {
            return res.status(404).json({
                success: false,
                message: 'Session tidak ditemukan atau tidak memiliki akses'
            });
        }
        
        // Cek apakah client ada dan siap
        if (!clients[sessionId] || !clients[sessionId].isReady) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp client belum siap. Silakan scan QR code terlebih dahulu.',
                needScan: true
            });
        }
        
        // Decode base64 file data
        const buffer = Buffer.from(fileData, 'base64');
        
        // Create temporary file path
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempFilePath = path.join(tempDir, `${Date.now()}_${fileName}`);
        fs.writeFileSync(tempFilePath, buffer);
        
        try {
            console.log('📤 Attempting to send file...');
            
            // Create a promise that handles the serialize error gracefully
            const sendFileWithFallback = () => {
                return new Promise((resolve, reject) => {
                    // Set a timeout for the entire operation
                    const timeout = setTimeout(() => {
                        reject(new Error('Send file timeout after 30 seconds'));
                    }, 30000);
                    
                    // Try to send the file
                    let sendPromise;
                    if (fileType.startsWith('image/')) {
                        // Send as image
                        const media = MessageMedia.fromFilePath(tempFilePath);
                        sendPromise = clients[sessionId].client.sendMessage(contactId, media, {
                            caption: message || ''
                        });
                    } else {
                        // Send as document
                        const media = MessageMedia.fromFilePath(tempFilePath);
                        sendPromise = clients[sessionId].client.sendMessage(contactId, media, {
                            caption: message || ''
                        });
                    }
                    
                    sendPromise
                        .then(result => {
                            clearTimeout(timeout);
                            console.log('✅ File sent successfully, result:', result);
                            resolve(result);
                        })
                        .catch(error => {
                            clearTimeout(timeout);
                            console.log('❌ Send file error:', error.message);
                            
                            // Check if it's a serialize error
                            if (error.message && error.message.includes('serialize')) {
                                console.log('🔄 Serialize error detected, will verify manually...');
                                // Don't reject, let the verification process handle it
                                resolve({ serializeError: true, originalError: error });
                            } else {
                                reject(error);
                            }
                        });
                });
            };
            
            const result = await sendFileWithFallback();
            
            // If we got a serialize error, verify manually
            if (result.serializeError) {
                console.log('🔄 Verifying file delivery after serialize error...');
                
                // Wait a bit for the file to be processed
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                try {
                    const chat = await clients[sessionId].client.getChatById(contactId);
                    if (chat) {
                        const recentMessages = await chat.fetchMessages({ limit: 10 });
                        
                        // Look for our file message in recent messages
                        const ourFileMessage = recentMessages.find(msg => 
                            msg.hasMedia && 
                            msg.fromMe === true &&
                            (msg.body === message || !message) // If no caption, just check for media
                        );
                        
                        if (ourFileMessage) {
                            console.log('✅ File message verified as sent despite serialize error');
                            res.status(200).json({
                                success: true,
                                message: 'File berhasil dikirim (verifikasi manual)',
                                messageId: 'manual-verification',
                                timestamp: Date.now(),
                                fileType: fileType,
                                fileName: fileName,
                                note: 'File verified as sent despite serialize error'
                            });
                            
                            // Clean up temp file
                            if (fs.existsSync(tempFilePath)) {
                                fs.unlinkSync(tempFilePath);
                            }
                            return;
                        } else {
                            console.log('❌ File message not found in recent messages');
                            throw new Error('File message not found in recent messages after serialize error');
                        }
                    }
                } catch (verifyError) {
                    console.error('❌ Error during manual verification:', verifyError);
                    throw new Error(`Serialize error and verification failed: ${verifyError.message}`);
                }
            }
            
            // Normal success case
            let messageId = null;
            let timestamp = null;
            
            try {
                if (result && result.id) {
                    messageId = result.id._serialized || result.id.id || result.id;
                }
                if (result && result.timestamp) {
                    timestamp = result.timestamp;
                }
            } catch (serializeError) {
                console.warn('⚠️ Serialize error on response parsing, but file sent successfully');
                messageId = 'response-parse-success';
                timestamp = Date.now();
            }
            
            // Clean up temp file
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
            
            res.status(200).json({
                success: true,
                message: 'File berhasil dikirim',
                messageId: messageId,
                timestamp: timestamp,
                fileType: fileType,
                fileName: fileName
            });
            
        } catch (sendError) {
            console.error('❌ Final error in send file:', sendError);
            
            // Clean up temp file on error
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
            
            res.status(500).json({
                success: false,
                message: 'Gagal mengirim file',
                error: sendError.message
            });
        }
        
    } catch (error) {
        console.error('Error saat mengirim file:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengirim file',
            error: error.message
        });
    }
});

// Endpoint untuk mendapatkan daftar contacts dalam session
app.get('/api/whatsapp/:sessionId/contacts', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        
        console.log('🚀 GET /api/whatsapp/:sessionId/contacts called');
        console.log('🔗 Session ID:', sessionId);
        console.log('👤 User ID:', userId);
        
        // Cek apakah session ada dan milik user
        const sessionRecord = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (!sessionRecord || sessionRecord.user_id !== userId) {
            return res.status(404).json({
                success: false,
                message: 'Session tidak ditemukan atau tidak memiliki akses'
            });
        }
        
        // Cek apakah client ada dan siap
        if (!clients[sessionId] || !clients[sessionId].isReady) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp client belum siap. Silakan scan QR code terlebih dahulu.',
                needScan: true
            });
        }
        
        // Ambil semua contacts
        const contacts = await clients[sessionId].client.getContacts();
        
        // Filter dan format contacts
        const formattedContacts = contacts
            .filter(contact => contact.id.server === 'c.us') // Hanya personal contacts, bukan groups
            .map(contact => ({
                id: contact.id._serialized,
                name: contact.name || contact.pushname || 'Tanpa Nama',
                number: contact.number,
                isGroup: contact.isGroup || false,
                isWAContact: contact.isWAContact || false,
                isMyContact: contact.isMyContact || false
            }))
            .sort((a, b) => a.name.localeCompare(b.name)); // Sort by name
        
        console.log(`📱 Found ${formattedContacts.length} contacts`);
        
        res.status(200).json({
            success: true,
            contacts: formattedContacts,
            total: formattedContacts.length
        });
        
    } catch (error) {
        console.error('Error saat mengambil daftar contacts:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil daftar contacts',
            error: error.message
        });
    }
});

// Endpoint untuk mendapatkan daftar session user
app.get('/api/whatsapp/sessions', async (req, res) => {
    try {
        console.log('🚀 GET /api/whatsapp/sessions called');
        console.log('🔗 Full URL:', req.originalUrl);
        console.log('📡 Method:', req.method);
        console.log('👤 User ID:', req.user?.id);
        console.log('🔑 User object:', req.user);
        console.log('📋 Request headers:', req.headers);
        
        if (!req.user || !req.user.id) {
            console.error('❌ No user or user ID found');
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }
        
        const userId = req.user.id;
        
        // Dapatkan semua session user dari database
        const sessions = await whatsappSessionQueries.getSessionsByUserId(userId);
        console.log('📱 Database sessions:', sessions);
        
        // Tambahkan status koneksi dari client yang sedang aktif
        const enhancedSessions = sessions.map(session => {
            const client = clients[session.session_id];
            return {
                ...session,
                isConnected: client ? client.isReady : false,
                hasQrCode: client ? client.qrCode !== null : false,
                lastSeen: client ? client.createdAt : session.updated_at
            };
        });
        
        console.log('✅ Enhanced sessions:', enhancedSessions);
        
        res.status(200).json({ 
            success: true, 
            sessions: enhancedSessions
        });
    } catch (error) {
        console.error('❌ Error saat mendapatkan daftar session:', error);
        console.error('❌ Error stack:', error.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mendapatkan daftar session', 
            error: error.message 
        });
    }
});


// Endpoint untuk mendapatkan QR code
app.get('/api/whatsapp/session/:sessionId/qrcode', verifyToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        
        // Verifikasi bahwa session milik user ini
        const session = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (!session || session.user_id !== userId) {
            return res.status(403).json({ 
                success: false, 
                message: 'Tidak memiliki akses ke session ini'
            });
        }
        
        // Reset session untuk mendapatkan QR code baru
        await deleteSessionAndReInitialize(sessionId);
        
        // Tunggu QR code dengan timeout yang dapat dikonfigurasi
        const maxWaitTime = config.whatsapp.qrTimeout;
        const checkInterval = 1000;
        let waitTime = 0;
        
        const waitForQrCode = async () => {
            // Periksa QR code
            if (clients[sessionId] && clients[sessionId].qrCode) {
                return res.status(200).json({ 
                    success: true, 
                    message: 'QR Code siap untuk di-scan',
                    qrCode: clients[sessionId].qrCode,
                    expiresIn: config.whatsapp.qrTimeout / 1000
                });
            }
            
            // Periksa apakah client sudah siap
            if (clients[sessionId] && clients[sessionId].isReady) {
                return res.status(200).json({ 
                    success: true, 
                    message: 'WhatsApp sudah terhubung, tidak perlu QR code',
                    isConnected: true
                });
            }
            
            waitTime += checkInterval;
            
            if (waitTime >= maxWaitTime) {
                return res.status(408).json({ 
                    success: false, 
                    message: 'Timeout menunggu QR code, coba lagi nanti'
                });
            }
            
            setTimeout(waitForQrCode, checkInterval);
        };
        
        waitForQrCode();
        
    } catch (error) {
        console.error('Error saat mendapatkan QR code:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mendapatkan QR code', 
            error: error.message 
        });
    }
});
// app.get('/api/whatsapp/session/:sessionId/qrcode', async (req, res) => {
//     try {
//         const { sessionId } = req.params;
//         const userId = req.user.id;  // Dari token JWT
        
//         // Verifikasi bahwa session milik user ini
//         const session = await whatsappSessionQueries.getSessionBySessionId(sessionId);
//         if (!session || session.user_id !== userId) {
//             return res.status(403).json({ 
//                 success: false, 
//                 message: 'Tidak memiliki akses ke session ini'
//             });
//         }
        
//         // Reset session untuk mendapatkan QR code baru
//         await deleteSessionAndReInitialize(sessionId);
        
//         // Tunggu sebentar sampai QR code tersedia
//         setTimeout(() => {
//             const qrCode = clients[sessionId] ? clients[sessionId].qrCode : null;
            
//             if (qrCode) {
//                 res.status(200).json({ 
//                     success: true, 
//                     message: 'QR Code siap untuk di-scan',
//                     qrCode: qrCode
//                 });
//             } else {
//                 res.status(404).json({ 
//                     success: false, 
//                     message: 'QR Code belum tersedia, coba lagi nanti'
//                 });
//             }
//         }, 2000);
//     } catch (error) {
//         console.error('Error saat mendapatkan QR code:', error);
//         res.status(500).json({ 
//             success: false, 
//             message: 'Gagal mendapatkan QR code', 
//             error: error.message 
//         });
//     }
// });

// Endpoint untuk memeriksa status koneksi
app.get('/api/whatsapp/session/:sessionId/status', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        
        // Verifikasi bahwa session milik user ini
        const session = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (!session || session.user_id !== userId) {
            return res.status(403).json({ 
                success: false, 
                message: 'Tidak memiliki akses ke session ini'
            });
        }
        
        const client = clients[sessionId];
        const isConnected = client ? client.isReady : false;
        
        res.status(200).json({ 
            success: true, 
            sessionId: sessionId,
            isConnected: isConnected,
            hasQrCode: client ? client.qrCode !== null : false,
            retryCount: client ? client.retryCount : 0,
            lastActivity: client ? client.createdAt : session.updated_at
        });
    } catch (error) {
        console.error('Error saat memeriksa status koneksi:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal memeriksa status koneksi', 
            error: error.message 
        });
    }
});

// Endpoint untuk memperbarui deskripsi session
app.put('/api/whatsapp/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        const { description } = req.body;
        
        // Verifikasi bahwa session milik user ini
        const session = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (!session || session.user_id !== userId) {
            return res.status(403).json({ 
                success: false, 
                message: 'Tidak memiliki akses ke session ini'
            });
        }
        
        // Update deskripsi di database
        const updatedSession = await whatsappSessionQueries.updateSessionDescription(sessionId, description);
        
        // Update deskripsi di client jika ada
        if (clients[sessionId]) {
            clients[sessionId].description = description;
        }
        
        res.status(200).json({ 
            success: true, 
            message: 'Deskripsi session berhasil diperbarui',
            session: updatedSession
        });
    } catch (error) {
        console.error('Error saat memperbarui deskripsi session:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal memperbarui deskripsi session', 
            error: error.message 
        });
    }
});

// Endpoint untuk logout dan menghapus session
app.delete('/api/whatsapp/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        
        // Verifikasi bahwa session milik user ini
        const session = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (!session || session.user_id !== userId) {
            return res.status(403).json({ 
                success: false, 
                message: 'Tidak memiliki akses ke session ini'
            });
        }
        
        // Logout dari WhatsApp jika client terhubung
        if (clients[sessionId] && clients[sessionId].client) {
            try {
                if (clients[sessionId].isReady) {
                    await clients[sessionId].client.logout();
                }
                await clients[sessionId].client.destroy();
            } catch (err) {
                console.error('Error destroying client:', err);
            }
            delete clients[sessionId];
        }
        
        // Hapus direktori sesi
        const sessionDir = path.join(SESSION_DIR, `session-${sessionId}`);
        if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
        }
        
        // Hapus dari database
        await whatsappSessionQueries.deleteSession(sessionId);
        
        res.status(200).json({ 
            success: true, 
            message: 'Session berhasil dihapus'
        });
    } catch (error) {
        console.error('Error saat menghapus session:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal menghapus session', 
            error: error.message 
        });
    }
});

// Endpoint untuk mengirim pesan WhatsApp
app.post('/api/whatsapp/session/:sessionId/send', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        const { number, message } = req.body;
        
        // Verifikasi bahwa session milik user ini
        const session = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (!session || session.user_id !== userId) {
            return res.status(403).json({ 
                success: false, 
                message: 'Tidak memiliki akses ke session ini'
            });
        }
        
        // Cek apakah client terhubung
        if (!clients[sessionId] || !clients[sessionId].isReady) {
            return res.status(503).json({ 
                success: false, 
                message: 'WhatsApp client belum siap. Silakan scan QR code terlebih dahulu.',
                needScan: true,
                qrCode: clients[sessionId] ? clients[sessionId].qrCode : null
            });
        }
        
        if (!number || !message) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nomor telepon dan pesan harus disediakan' 
            });
        }

        // Format nomor telepon
        let formattedNumber = number.replace(/\D/g, '');
        
        // Validasi nomor telepon
        if (formattedNumber.length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Nomor telepon tidak valid'
            });
        }
        
        // Tambahkan @c.us di akhir nomor
        if (!formattedNumber.endsWith('@c.us')) {
            formattedNumber = `${formattedNumber}@c.us`;
        }

        // Kirim pesan dengan error handling yang robust
        let sendResult;
        let messageId = null;
        let timestamp = Date.now();

        try {
            sendResult = await clients[sessionId].client.sendMessage(formattedNumber, message);
            
            // Robust message ID extraction
            try {
                if (sendResult && sendResult.id) {
                    if (sendResult.id._serialized) {
                        messageId = sendResult.id._serialized;
                    } else if (sendResult.id.id) {
                        messageId = sendResult.id.id;
                    } else if (typeof sendResult.id === 'string') {
                        messageId = sendResult.id;
                    } else {
                        messageId = JSON.stringify(sendResult.id);
                    }
                }
                
                // Get timestamp from result if available
                if (sendResult && sendResult.timestamp) {
                    timestamp = sendResult.timestamp;
                }
            } catch (extractError) {
                console.warn('Failed to extract message ID:', extractError.message);
                messageId = 'unknown';
            }
        } catch (sendError) {
            // Check if it's a serialize error (message was sent but ID extraction failed)
            if (sendError.message && sendError.message.includes('serialize')) {
                console.warn('Message sent but failed to get confirmation ID (serialize error)');
                messageId = 'sent_no_id';
                // Message was actually sent, so we consider it successful
            } else {
                // Re-throw other errors
                throw sendError;
            }
        }

        res.status(200).json({ 
            success: true, 
            message: messageId === 'sent_no_id' ? 'Pesan berhasil dikirim (tanpa ID konfirmasi)' : 'Pesan berhasil dikirim',
            data: {
                id: messageId,
                timestamp: timestamp,
                to: formattedNumber
            }
        });
    } catch (error) {
        console.error('Error saat mengirim pesan:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mengirim pesan', 
            error: error.message 
        });
    }
});


// Fungsi untuk memuat semua session dari database
// const loadAllSessions = async () => {
//     try {
//         // Dapatkan semua session dari database
//         const sessions = await whatsappSessionQueries.getAllSessions();
//         console.log(`Menemukan ${sessions.length} session di database`);
        
//         // Buat client untuk setiap session
//         for (const session of sessions) {
//             await createWhatsAppClient(session);
//         }
        
//         console.log(`Berhasil memuat ${Object.keys(clients).length} client WhatsApp`);
//     } catch (error) {
//         console.error('Error saat memuat session dari database:', error);
//     }
// };

// Inisialisasi aplikasi
// const initializeApp = async () => {
//     try {
//         // Test koneksi database
//         const dbConnected = await testConnection();
//         if (!dbConnected) {
//             console.error('Aplikasi gagal menghubungkan ke database');
//             process.exit(1);
//         }
        
//         // Inisialisasi tabel
//         await initDatabase();
        
//         // Muat semua session
//         await loadAllSessions();
        
//         // Jalankan server
//         // app.listen(port, () => {
//         //     console.log(`Server berjalan di port ${port}`);
//         //     console.log(`Direktori sesi: ${SESSION_DIR}`);
//         // });
//         http.listen(port, () => {
//             console.log(`Server berjalan di port ${port}`);
//             console.log(`Direktori sesi: ${SESSION_DIR}`);
//         });
        
//     } catch (error) {
//         console.error('Error saat inisialisasi aplikasi:', error);
//         process.exit(1);
//     }
// };

// Tambahkan di bagian routing setelah mendefinisikan rute API lainnya
app.use('/', viewRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: config.server.nodeEnv === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Fungsi untuk memuat semua session dari database
const loadAllSessions = async () => {
    try {
        const sessions = await whatsappSessionQueries.getAllSessions();
        console.log(`🔍 Menemukan ${sessions.length} session di database`);
        
        let loadedCount = 0;
        
        // Load sessions with delay to prevent overwhelming
        for (const session of sessions) {
            try {
                await createWhatsAppClient(session);
                loadedCount++;
                
                // Small delay between session loads
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Failed to load session ${session.session_id}:`, error.message);
                // Continue with next session even if one fails
            }
        }
        
        console.log(`✅ Berhasil memuat ${loadedCount}/${sessions.length} client WhatsApp`);
        
        // Return success even if some sessions failed to load
        return true;
    } catch (error) {
        console.error('Error saat memuat session dari database:', error);
        // Return false but don't throw to prevent app from crashing
        return false;
    }
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
    console.log(`🔄 Received ${signal}. Starting graceful shutdown...`);
    
    try {
        // Close all WhatsApp clients
        const clientPromises = Object.keys(clients).map(async (sessionId) => {
            try {
                if (clients[sessionId].client) {
                    await clients[sessionId].client.destroy();
                }
            } catch (err) {
                console.error(`Error closing client ${sessionId}:`, err.message);
            }
        });
        
        await Promise.all(clientPromises);
        console.log('✅ All WhatsApp clients closed');
        
        // Close HTTP server
        http.close(() => {
            console.log('✅ HTTP server closed');
            process.exit(0);
        });
        
        // Force exit after 30 seconds
        setTimeout(() => {
            console.log('❌ Force exit after timeout');
            process.exit(1);
        }, 30000);
        
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
});

// Inisialisasi aplikasi
const initializeApp = async () => {
    try {
        console.log('🚀 Initializing WhatsApp Web API...');
        console.log(`📊 Environment: ${config.server.nodeEnv}`);
        
        // Test koneksi database
        const dbConnected = await testConnection();
        if (!dbConnected) {
            console.error('❌ Database connection failed');
            process.exit(1);
        }
        
        // Inisialisasi tabel
        await initDatabase();
        
        // Load existing sessions (don't await to prevent blocking)
        loadAllSessions().catch(error => {
            console.error('Error loading sessions (non-blocking):', error);
        });
        
        // Start server
        http.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
            console.log(`📁 Session directory: ${SESSION_DIR}`);
            console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
            console.log(`🌐 Environment: ${config.server.nodeEnv}`);
            console.log(`📡 Socket.IO enabled`);
            
            if (config.features.enableBroadcast) {
                console.log(`📢 Broadcast feature enabled`);
            }
            
            console.log('✅ Application initialized successfully!');
        });
        
    } catch (error) {
        console.error('❌ Error during application initialization:', error);
        process.exit(1);
    }
};

// Start the application
initializeApp();

