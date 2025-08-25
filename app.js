require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');


// Di bagian atas file app.js, setelah require lainnya
const clients = require('./clients');

// Import modul
const { testConnection, initDatabase, whatsappSessionQueries } = require('./db');
const { authenticateToken, registerUser, loginUser } = require('./auth');

// Tambahkan di bagian atas setelah import routes yang sudah ada
const contactRoutes = require('./routes/api/contactRoutes');
const chatRoutes = require('./routes/api/chatRoutes');
const userRoutes = require('./routes/api/userRoutes');
const broadcastRoutes = require('./routes/api/broadcastRoutes');

const { config, validateConfig } = require('./config/config');

// Validate configuration at startup
validateConfig();

// Inisialisasi Express
const app = express();
app.use(express.json());
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

                io.to(session_id).emit('receive-message', {
                    contactId: msg.from,
                    message: msg.body,
                    fromMe: false,
                    timestamp: msg.timestamp,
                    id: messageId
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

// Rute WhatsApp API yang memerlukan autentikasi
app.use('/api', authenticateToken);

app.use('/api/users', userRoutes);

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


// Endpoint untuk mendapatkan daftar session user
app.get('/api/whatsapp/sessions', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Dapatkan semua session user dari database
        const sessions = await whatsappSessionQueries.getSessionsByUserId(userId);
        
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
        
        res.status(200).json({ 
            success: true, 
            sessions: enhancedSessions
        });
    } catch (error) {
        console.error('Error saat mendapatkan daftar session:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mendapatkan daftar session', 
            error: error.message 
        });
    }
});


// Endpoint untuk mendapatkan QR code
app.get('/api/whatsapp/session/:sessionId/qrcode', async (req, res) => {
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
app.use('/api/whatsapp', contactRoutes);
app.use('/api/whatsapp', chatRoutes);
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
            }
        }
        
        console.log(`✅ Berhasil memuat ${loadedCount}/${sessions.length} client WhatsApp`);
    } catch (error) {
        console.error('Error saat memuat session dari database:', error);
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
        
        // Load existing sessions
        await loadAllSessions();
        
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

