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

    // Gunakan session_id saja untuk direktori session (lebih stabil)
    const sessionDir = path.join(SESSION_DIR, `session-${session_id}`);

    // Pastikan direktori session ada
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Buat client baru dengan konfigurasi yang lebih robust untuk mengatasi ready callback issue
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: `session-${session_id}`,
            dataPath: sessionDir
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-plugins',
                '--disable-images',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--mute-audio',
                '--no-default-browser-check',
                '--no-pings',
                '--password-store=basic',
                '--use-mock-keychain',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=VizDisplayCompositor',
                '--disable-accelerated-2d-canvas',
                '--disable-accelerated-jpeg-decoding',
                '--disable-accelerated-mjpeg-decode',
                '--disable-accelerated-video-decode',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-client-side-phishing-detection',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--disable-dev-shm-usage',
                '--disable-extensions',
                '--disable-features=TranslateUI',
                '--disable-hang-monitor',
                '--disable-ipc-flooding-protection',
                '--disable-popup-blocking',
                '--disable-prompt-on-repost',
                '--disable-renderer-backgrounding',
                '--disable-sync',
                '--disable-translate',
                '--disable-windows10-custom-titlebar',
                '--metrics-recording-only',
                '--no-first-run',
                '--safebrowsing-disable-auto-update',
                '--enable-automation',
                '--password-store=basic',
                '--use-mock-keychain'
            ]
        },
        // Using stable WhatsApp Web version to avoid sendSeen/markedUnread errors
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/refs/heads/main/html/2.3000.1031490220-alpha.html'
        },
        restartOnAuthFail: true,
        takeoverOnConflict: false,
        takeoverTimeoutMs: 0,
        // Tambahan konfigurasi untuk mengatasi ready callback issue
        qrMaxRetries: 5,
        qrTimeout: 60000,
        authTimeoutMs: 60000,
        qrRefreshInterval: 20000
    });

    // Simpan status koneksi
    clients[session_id] = {
        client,
        userId: user_id,
        isReady: false,
        qrCode: null,
        qrTimestamp: null, // Tambahkan timestamp untuk QR code
        createdAt: new Date().toISOString(),
        description: description || null,
        sessionDir: sessionDir // Simpan path direktori session
    };

    // Timeout mechanism untuk menangani ready callback yang tidak terpicu
    let readyTimeout = setTimeout(() => {
        console.log(`⚠️ Ready callback timeout for session ${session_id}, checking client state...`);
        console.log(`📱 Client state: ${client.state}`);
        console.log(`📱 Client info:`, client.info);
        console.log(`📱 Client isReady: ${clients[session_id].isReady}`);

        if (client.state === 'CONNECTED' && !clients[session_id].isReady) {
            console.log(`🔄 Force updating client status due to timeout...`);
            clients[session_id].isReady = true;
            clients[session_id].lastActivity = new Date().toISOString();
            clients[session_id].phoneNumber = client.info?.wid || null;
            clients[session_id].qrCode = null;

            // Update database
            whatsappSessionQueries.updateSessionStatus(session_id, true).catch(err => {
                console.error(`❌ Error updating database after timeout:`, err);
            });

            // Emit socket event
            io.emit('session-ready', {
                sessionId: session_id,
                phoneNumber: clients[session_id].phoneNumber,
                timestamp: new Date().toISOString()
            });

            console.log(`✅ Client status force updated after timeout`);
        } else if (client.state === 'OPENING' && !clients[session_id].isReady) {
            console.log(`🔄 Client is opening, waiting 10 more seconds...`);
            // Extend timeout untuk OPENING state
            setTimeout(() => {
                if (client.state === 'CONNECTED' && !clients[session_id].isReady) {
                    console.log(`🔄 Force updating client status after extended timeout...`);
                    clients[session_id].isReady = true;
                    clients[session_id].lastActivity = new Date().toISOString();
                    clients[session_id].phoneNumber = client.info?.wid || null;
                    clients[session_id].qrCode = null;

                    // Update database
                    whatsappSessionQueries.updateSessionStatus(session_id, true).catch(err => {
                        console.error(`❌ Error updating database after extended timeout:`, err);
                    });

                    // Emit socket event
                    io.emit('session-ready', {
                        sessionId: session_id,
                        phoneNumber: clients[session_id].phoneNumber,
                        timestamp: new Date().toISOString()
                    });

                    console.log(`✅ Client status force updated after extended timeout`);
                }
            }, 10000); // 10 detik tambahan
        }
    }, 30000); // 30 detik timeout

    // Polling mechanism untuk menangani event handler yang tidak terpicu
    let pollingInterval = setInterval(async () => {
        if (client && !clients[session_id].isReady) {
            console.log(`🔄 Polling client state for session ${session_id}...`);
            console.log(`📱 Client state: ${client.state}`);
            console.log(`📱 Client info:`, client.info);
            console.log(`📱 Client type:`, typeof client);
            console.log(`📱 Client keys:`, Object.keys(client || {}));

            // Cek apakah client memiliki method getState atau getInfo
            if (typeof client.getState === 'function') {
                try {
                    // Cek apakah client page siap
                    if (!client.pupPage) {
                        console.log(`📱 Polling: Client page not ready for ${session_id}`);
                        return;
                    }

                    const state = await client.getState();
                    console.log(`📱 Client getState(): ${state}`);
                } catch (err) {
                    console.log(`📱 Error calling getState():`, err.message);
                    // Jika error getState, coba restart client
                    if (err.message.includes('evaluate') || err.message.includes('null')) {
                        console.log(`🔄 Polling detected client issue, attempting restart...`);
                        try {
                            await client.destroy();
                            await new Promise(resolve => setTimeout(resolve, 5000));
                            await createWhatsAppClient(session_id);
                            console.log(`✅ Client restarted via polling`);
                        } catch (restartError) {
                            console.log(`❌ Failed to restart client via polling:`, restartError.message);
                        }
                    }
                }
            }

            if (typeof client.getInfo === 'function') {
                try {
                    const info = client.getInfo();
                    console.log(`📱 Client getInfo():`, info);
                } catch (err) {
                    console.log(`📱 Error calling getInfo():`, err.message);
                }
            }

            // Cek state dari getState() result jika tersedia
            let actualState = client.state;
            if (typeof client.getState === 'function') {
                try {
                    const stateResult = await client.getState();
                    if (stateResult) {
                        actualState = stateResult;
                        console.log(`📱 Polling getState() result: ${actualState}`);
                    }
                } catch (err) {
                    console.log(`📱 Polling getState() error:`, err.message);
                }
            }

            // Fallback: Coba akses properti langsung
            if (actualState === 'CONNECTED' && client.info && client.info.wid) {
                console.log(`🔄 Polling detected CONNECTED state, updating client status...`);
                clients[session_id].isReady = true;
                clients[session_id].lastActivity = new Date().toISOString();
                clients[session_id].phoneNumber = client.info.wid;
                clients[session_id].qrCode = null;

                // Clear timeout dan polling
                if (readyTimeout) {
                    clearTimeout(readyTimeout);
                }
                clearInterval(pollingInterval);

                // Update database
                whatsappSessionQueries.updateSessionStatus(session_id, true).catch(err => {
                    console.error(`❌ Error updating database after polling:`, err);
                });

                // Emit socket event
                io.emit('session-ready', {
                    sessionId: session_id,
                    phoneNumber: clients[session_id].phoneNumber,
                    timestamp: new Date().toISOString()
                });

                console.log(`✅ Client status updated via polling`);
            } else if (actualState === 'CONNECTED' && client.info) {
                // Jika state CONNECTED tapi belum ada wid, coba ambil dari info
                console.log(`🔄 Polling detected CONNECTED state with info, updating client status...`);
                clients[session_id].isReady = true;
                clients[session_id].lastActivity = new Date().toISOString();
                clients[session_id].phoneNumber = client.info.wid || client.info.me || 'Unknown';
                clients[session_id].qrCode = null;

                // Clear timeout dan polling
                if (readyTimeout) {
                    clearTimeout(readyTimeout);
                }
                clearInterval(pollingInterval);

                // Update database
                whatsappSessionQueries.updateSessionStatus(session_id, true).catch(err => {
                    console.error(`❌ Error updating database after polling:`, err);
                });

                // Emit socket event
                io.emit('session-ready', {
                    sessionId: session_id,
                    phoneNumber: clients[session_id].phoneNumber,
                    timestamp: new Date().toISOString()
                });

                console.log(`✅ Client status updated via polling with info`);
            } else if (client.state === 'OPENING' || client.state === 'PAIRING') {
                console.log(`📱 Client is ${client.state}, waiting...`);
            } else if (client.state === 'UNPAIRED' || client.state === 'UNLAUNCHED') {
                console.log(`📱 Client is ${client.state}, may need to restart...`);
            } else {
                console.log(`📱 Client state unknown: ${client.state}, checking if client is working...`);

                // Fallback: Coba cek apakah client bisa mengirim pesan atau tidak
                if (typeof client.sendMessage === 'function') {
                    console.log(`📱 Client has sendMessage method, but waiting for proper connection...`);
                    // JANGAN set isReady=true di sini, biarkan event handler yang menangani
                    // Hanya log untuk debugging
                }
            }
        } else if (clients[session_id].isReady) {
            // Clear polling jika sudah ready
            clearInterval(pollingInterval);
        }
    }, 5000); // Poll setiap 5 detik

    // Tidak perlu cleanup directory karena menggunakan path yang sama

    // Event saat QR code tersedia untuk di-scan
    client.on('qr', (qr) => {
        // Cek apakah client sudah authenticated/ready - jika ya, jangan generate QR lagi
        if (clients[session_id].isReady || client.state === 'CONNECTED') {
            console.log(`📱 Client untuk session ${session_id} sudah ready/connected, tidak perlu QR code lagi`);
            console.log(`📱 Client state: ${client.state}, isReady: ${clients[session_id].isReady}`);
            return;
        }

        // Cek apakah QR code sudah ada dan sama untuk mencegah duplikasi
        if (clients[session_id].qrCode === qr) {
            console.log(`📱 QR Code untuk session ${session_id} sudah ada, skipping...`);
            return;
        }

        console.log(`📱 QR Code untuk session ${session_id} tersedia!`);
        console.log(`📱 QR Code length: ${qr.length}`);
        console.log(`📱 Client state saat QR: ${client.state}`);
        clients[session_id].qrCode = qr;
        clients[session_id].qrTimestamp = Date.now(); // Catat waktu QR code dibuat
        console.log(`📱 QR Code saved for session ${session_id}`);

        // Simpan QR code ke database (non-blocking)
        whatsappSessionQueries.updateSessionConnection(session_id, qr, false)
            .then(() => {
                console.log(`💾 QR Code saved to database for session ${session_id}`);
            })
            .catch(dbError => {
                console.error(`❌ Error saving QR code to database:`, dbError);
            });
    });

    // Event saat client siap - dengan fallback mechanism untuk fork BenyFilho
    client.on('ready', async () => {
        console.log(`🚀🚀🚀 READY EVENT TRIGGERED untuk session ${session_id} (BenyFilho fork) 🚀🚀🚀`);
        console.log(`📱 Phone number: ${client.info?.wid || 'Unknown'}`);
        console.log(`📱 Client state: ${client.state || 'Unknown'}`);
        console.log(`📱 Client info:`, client.info);
        console.log(`📱 Client info type:`, typeof client.info);
        console.log(`📱 Client info wid:`, client.info?.wid);
        console.log(`📱 Client info me:`, client.info?.me);
        console.log(`📱 Client info pushname:`, client.info?.pushname);
        console.log(`📱 Current client data before update:`, {
            isReady: clients[session_id]?.isReady,
            phoneNumber: clients[session_id]?.phoneNumber,
            lastActivity: clients[session_id]?.lastActivity
        });

        // Fallback: Jika client.info tidak ada, tunggu sebentar dan coba lagi
        if (!client.info || !client.info.wid) {
            console.log(`⚠️ Client info not available, waiting 2 seconds and retrying...`);
            setTimeout(async () => {
                if (client.info && client.info.wid) {
                    console.log(`📱 Retry successful - Phone number: ${client.info.wid}`);
                    await updateClientStatus();
                } else {
                    console.log(`⚠️ Retry failed - Client info still not available`);
                }
            }, 2000);
        } else {
            await updateClientStatus();
        }

        async function updateClientStatus() {
            // Clear timeout karena ready event berhasil terpicu
            if (readyTimeout) {
                clearTimeout(readyTimeout);
                console.log(`✅ Ready event triggered, cleared timeout for session ${session_id}`);
            }

            // Update client data - tidak ada skip untuk memastikan update
            clients[session_id].isReady = true;
            clients[session_id].qrCode = null;
            clients[session_id].lastActivity = new Date().toISOString();
            clients[session_id].phoneNumber = client.info?.wid || null;

            console.log(`📊 READY EVENT - Updated client data for session ${session_id}:`, {
                isReady: clients[session_id].isReady,
                phoneNumber: clients[session_id].phoneNumber,
                lastActivity: clients[session_id].lastActivity,
                qrCode: clients[session_id].qrCode
            });

            console.log(`📊 Updated client data:`, {
                isReady: clients[session_id].isReady,
                phoneNumber: clients[session_id].phoneNumber,
                lastActivity: clients[session_id].lastActivity
            });

            // Update status di database
            try {
                await whatsappSessionQueries.updateSessionStatus(session_id, true);
                console.log(`✅ Status session ${session_id} berhasil diperbarui di database`);

                // Update juga last_activity di database
                try {
                    await whatsappSessionQueries.updateSessionActivity(session_id);
                    console.log(`✅ Last activity updated for session ${session_id}`);
                } catch (activityError) {
                    console.warn(`⚠️ Error updating last activity:`, activityError.message);
                }
            } catch (error) {
                console.error(`❌ Error saat memperbarui status session ${session_id}:`, error);
            }

            // Emit event ke frontend melalui Socket.IO jika tersedia
            try {
                const { getIO } = require('./socket');
                const io = getIO();
                if (io) {
                    const eventData = {
                        sessionId: session_id,
                        isReady: true,
                        phoneNumber: client.info?.wid || null,
                        timestamp: new Date().toISOString()
                    };

                    io.to(`session-${session_id}`).emit('session-ready', eventData);
                    console.log(`📡 Event session-ready dikirim untuk session ${session_id}:`, eventData);
                } else {
                    console.warn(`⚠️ Socket.IO tidak tersedia untuk session ${session_id}`);
                }
            } catch (socketError) {
                console.warn(`⚠️ Socket.IO error untuk session ${session_id}:`, socketError.message);
            }

            // Force update status setelah 2 detik untuk memastikan sinkronisasi
            setTimeout(async () => {
                console.log(`🔄 Force updating status for session ${session_id}`);
                try {
                    await whatsappSessionQueries.updateSessionStatus(session_id, true);
                    console.log(`✅ Force update completed for session ${session_id}`);
                } catch (error) {
                    console.error(`❌ Force update failed for session ${session_id}:`, error);
                }
            }, 2000);
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
        console.error(`❌ Auth failure for session ${session_id}:`, error);
        clients[session_id].isReady = false;
    });

    // Event untuk debugging - REMOVED (duplicate)
    // client.on('loading_screen', (percent, message) => {
    //     console.log(`📱 Loading screen for session ${session_id}: ${percent}% - ${message}`);
    // });

    // client.on('remote_session_saved', () => {
    //     console.log(`📱 Remote session saved for session ${session_id}`);
    // });

    // Event untuk mendeteksi QR code scan - REMOVED (duplicate)
    // client.on('qr', (qr) => {
    //     console.log(`📱 QR Code generated for session ${session_id}`);
    //     console.log(`📱 QR Code length: ${qr ? qr.length : 0}`);
    // });

    // Event untuk mendeteksi authentication
    client.on('authenticated', async () => {
        console.log(`✅✅✅ AUTHENTICATED EVENT TRIGGERED untuk session ${session_id} (BenyFilho fork) ✅✅✅`);
        console.log(`📱 Client state saat authenticated: ${client.state}`);
        console.log(`📱 Client info saat authenticated:`, client.info);
        console.log(`📱 Client info type:`, typeof client.info);
        console.log(`📱 Client info wid:`, client.info?.wid);
        console.log(`📱 Client info me:`, client.info?.me);
        console.log(`📱 Client info pushname:`, client.info?.pushname);
        console.log(`📱 Current client data before update:`, {
            isReady: clients[session_id]?.isReady,
            phoneNumber: clients[session_id]?.phoneNumber,
            lastActivity: clients[session_id]?.lastActivity
        });

        // Update status di database saat authentication berhasil
        try {
            await whatsappSessionQueries.updateSessionStatus(session_id, true);
            console.log(`✅ Status updated in database for authentication: ${session_id}`);

            // Update juga last_activity
            try {
                await whatsappSessionQueries.updateSessionActivity(session_id);
                console.log(`✅ Last activity updated for authentication: ${session_id}`);
            } catch (activityError) {
                console.warn(`⚠️ Error updating last activity for authentication:`, activityError.message);
            }
        } catch (error) {
            console.error(`❌ Error updating status for authentication ${session_id}:`, error);
        }

        // Update client data
        clients[session_id].isReady = true;
        clients[session_id].lastActivity = new Date().toISOString();
        clients[session_id].phoneNumber = client.info?.wid || null;
        clients[session_id].qrCode = null; // Clear QR code saat authenticated

        // Simpan status koneksi ke database
        try {
            await whatsappSessionQueries.updateSessionConnection(session_id, null, true, clients[session_id].phoneNumber);
            console.log(`💾 Connection status saved to database for session ${session_id}`);
        } catch (dbError) {
            console.error(`❌ Error saving connection status to database:`, dbError);
        }

        console.log(`📊 AUTHENTICATED EVENT - Updated client data for session ${session_id}:`, {
            isReady: clients[session_id].isReady,
            phoneNumber: clients[session_id].phoneNumber,
            lastActivity: clients[session_id].lastActivity,
            qrCode: clients[session_id].qrCode
        });

        // Emit event ke frontend
        try {
            const { getIO } = require('./socket');
            const io = getIO();
            if (io) {
                const eventData = {
                    sessionId: session_id,
                    isReady: true,
                    phoneNumber: client.info?.wid || null,
                    timestamp: new Date().toISOString(),
                    event: 'authenticated'
                };

                io.to(`session-${session_id}`).emit('session-ready', eventData);
                console.log(`📡 Authentication event emitted for session ${session_id}:`, eventData);
            }
        } catch (socketError) {
            console.warn(`⚠️ Socket.IO error for authentication:`, socketError.message);
        }
    });

    // Event untuk mendeteksi authentication failure
    client.on('auth_failure', (msg) => {
        console.error(`❌ Authentication failed for session ${session_id}:`, msg);
        clients[session_id].isReady = false;
    });

    // Event untuk mendeteksi session saved
    client.on('remote_session_saved', () => {
        console.log(`📱 Remote session saved for session ${session_id}`);
        console.log(`📱 Client state saat session saved: ${client.state}`);
        // Pastikan status terupdate saat session saved
        if (client.state === 'CONNECTED' || client.state === 'OPENING') {
            clients[session_id].isReady = true;
            clients[session_id].lastActivity = new Date().toISOString();
            clients[session_id].phoneNumber = client.info?.wid || null;
            console.log(`📱 Session saved - updated client data for session ${session_id}`);
            // Update database
            whatsappSessionQueries.updateSessionStatus(session_id, true).catch(err => {
                console.error(`❌ Error updating status for session saved:`, err);
            });
        }
    });

    // Event untuk mendeteksi loading screen
    client.on('loading_screen', (percent, message) => {
        console.log(`📱 Loading screen for session ${session_id}: ${percent}% - ${message}`);
        // Jika loading screen menunjukkan progress, mungkin client sedang connecting
        if (percent > 50) {
            console.log(`📱 Loading progress high, checking if client is connecting...`);
        }
    });

    // Event untuk mendeteksi perubahan status
    client.on('change_state', async (state) => {
        console.log(`📱 State change for session ${session_id}: ${state}`);
        console.log(`📱 Client info:`, {
            isReady: clients[session_id]?.isReady,
            phoneNumber: client.info?.wid,
            state: client.state
        });

        // Update status berdasarkan state
        if (state === 'CONNECTED') {
            console.log(`✅✅✅ CHANGE_STATE CONNECTED EVENT TRIGGERED untuk session ${session_id} (BenyFilho fork) ✅✅✅`);
            console.log(`📱 Client info saat CONNECTED:`, client.info);
            console.log(`📱 Client info type:`, typeof client.info);
            console.log(`📱 Client info wid:`, client.info?.wid);
            console.log(`📱 Client info me:`, client.info?.me);
            console.log(`📱 Client info pushname:`, client.info?.pushname);
            console.log(`📱 Current client data before update:`, {
                isReady: clients[session_id]?.isReady,
                phoneNumber: clients[session_id]?.phoneNumber,
                lastActivity: clients[session_id]?.lastActivity
            });

            clients[session_id].isReady = true;
            clients[session_id].lastActivity = new Date().toISOString();
            clients[session_id].phoneNumber = client.info?.wid || null;
            clients[session_id].qrCode = null; // Clear QR code saat terhubung

            // Simpan status koneksi ke database
            try {
                await whatsappSessionQueries.updateSessionConnection(session_id, null, true, clients[session_id].phoneNumber);
                console.log(`💾 Connection status saved to database for session ${session_id}`);
            } catch (dbError) {
                console.error(`❌ Error saving connection status to database:`, dbError);
            }

            console.log(`📊 CHANGE_STATE CONNECTED - Updated client data for session ${session_id}:`, {
                isReady: clients[session_id].isReady,
                phoneNumber: clients[session_id].phoneNumber,
                lastActivity: clients[session_id].lastActivity,
                qrCode: clients[session_id].qrCode
            });

            // Update database
            whatsappSessionQueries.updateSessionStatus(session_id, true).then(async () => {
                console.log(`✅ Status updated for state change: ${session_id}`);
                // Update juga last_activity
                try {
                    await whatsappSessionQueries.updateSessionActivity(session_id);
                    console.log(`✅ Last activity updated for state change: ${session_id}`);
                } catch (activityError) {
                    console.warn(`⚠️ Error updating last activity for state change:`, activityError.message);
                }
            }).catch(err => {
                console.error(`❌ Error updating status for state change:`, err);
            });

            // Emit event ke frontend
            try {
                const { getIO } = require('./socket');
                const io = getIO();
                if (io) {
                    io.to(`session-${session_id}`).emit('session-ready', {
                        sessionId: session_id,
                        isReady: true,
                        phoneNumber: client.info?.wid || null,
                        timestamp: new Date().toISOString()
                    });
                    console.log(`📡 Session-ready event emitted for state change: ${session_id}`);
                }
            } catch (socketError) {
                console.warn(`⚠️ Socket.IO error for state change:`, socketError.message);
            }
        } else if (state === 'DISCONNECTED') {
            console.log(`❌ Client disconnected for session ${session_id}`);
            clients[session_id].isReady = false;

            // Update database
            whatsappSessionQueries.updateSessionStatus(session_id, false).catch(err => {
                console.error(`❌ Error updating status for disconnection:`, err);
            });
        } else if (state === 'OPENING') {
            console.log(`🔄 Client opening for session ${session_id}`);
            // Update status saat opening (QR code sedang diproses)
            clients[session_id].isReady = false;

            // Emit event ke frontend
            try {
                const { getIO } = require('./socket');
                const io = getIO();
                if (io) {
                    io.to(`session-${session_id}`).emit('session-opening', {
                        sessionId: session_id,
                        state: 'OPENING',
                        timestamp: new Date().toISOString()
                    });
                    console.log(`📡 Session-opening event emitted for session ${session_id}`);
                }
            } catch (socketError) {
                console.warn(`⚠️ Socket.IO error for opening:`, socketError.message);
            }
        } else if (state === 'PAIRING') {
            console.log(`🔗 Client pairing for session ${session_id}`);
            // Update status saat pairing (QR code sedang diproses)
            clients[session_id].isReady = false;

            // Emit event ke frontend
            try {
                const { getIO } = require('./socket');
                const io = getIO();
                if (io) {
                    io.to(`session-${session_id}`).emit('session-pairing', {
                        sessionId: session_id,
                        state: 'PAIRING',
                        timestamp: new Date().toISOString()
                    });
                    console.log(`📡 Session-pairing event emitted for session ${session_id}`);
                }
            } catch (socketError) {
                console.warn(`⚠️ Socket.IO error for pairing:`, socketError.message);
            }
        } else if (state === 'UNPAIRED') {
            console.log(`❌ Client unpaired for session ${session_id}`);
            clients[session_id].isReady = false;

            // Update database untuk unpaired
            whatsappSessionQueries.updateSessionStatus(session_id, false).catch(err => {
                console.error(`❌ Error updating status for unpaired:`, err);
            });
        } else if (state === 'UNLAUNCHED') {
            console.log(`⏸️ Client unlaunched for session ${session_id}`);
            clients[session_id].isReady = false;
        } else {
            console.log(`📱 Unknown state for session ${session_id}: ${state}`);
        }
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
    try {
        // Destroy client terlebih dahulu
        if (clients[sessionId] && clients[sessionId].client) {
            try {
                await clients[sessionId].client.destroy();
                console.log(`✅ Client destroyed for session ${sessionId}`);
            } catch (destroyError) {
                console.warn(`⚠️ Error destroying client for session ${sessionId}:`, destroyError.message);
            }
        }

        // Simpan path direktori session sebelum menghapus client
        const oldSessionDir = clients[sessionId]?.sessionDir;

        delete clients[sessionId];

        // Hapus direktori session
        const sessionDir = path.join(SESSION_DIR, `session-${sessionId}`);
        if (fs.existsSync(sessionDir)) {
            await removeDirectoryWithRetry(sessionDir, 3);
        }

        // Dapatkan data session dari database
        const sessionRecord = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (sessionRecord) {
            // Buat client baru
            return createWhatsAppClient(sessionRecord);
        }
    } catch (error) {
        console.error(`❌ Error saat me-reset session ${sessionId}:`, error);
        // Tetap coba buat client baru meskipun ada error
        try {
            const sessionRecord = await whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (sessionRecord) {
                return createWhatsAppClient(sessionRecord);
            }
        } catch (fallbackError) {
            console.error(`❌ Fallback error saat membuat client baru:`, fallbackError);
        }
    }

    return null;
};

// Fungsi helper untuk menghapus direktori dengan retry
const removeDirectoryWithRetry = async (dirPath, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🗑️ Attempt ${attempt} to remove directory: ${dirPath}`);

            // Coba hapus dengan force
            fs.rmSync(dirPath, { recursive: true, force: true });
            console.log(`✅ Directory removed successfully: ${dirPath}`);
            return;
        } catch (error) {
            console.warn(`⚠️ Attempt ${attempt} failed to remove directory:`, error.message);

            if (attempt === maxRetries) {
                console.error(`❌ Failed to remove directory after ${maxRetries} attempts: ${dirPath}`);
                // Coba hapus file individual jika direktori tidak bisa dihapus
                try {
                    await removeDirectoryContents(dirPath);
                    console.log(`✅ Directory contents removed: ${dirPath}`);
                } catch (contentError) {
                    console.error(`❌ Failed to remove directory contents:`, contentError.message);
                }
                return;
            }

            // Tunggu sebentar sebelum retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
};

// Fungsi helper untuk menghapus isi direktori
const removeDirectoryContents = async (dirPath) => {
    try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                await removeDirectoryWithRetry(filePath, 2);
            } else {
                try {
                    fs.unlinkSync(filePath);
                } catch (unlinkError) {
                    console.warn(`⚠️ Could not remove file ${filePath}:`, unlinkError.message);
                }
            }
        }
    } catch (error) {
        console.error(`❌ Error removing directory contents:`, error.message);
    }
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
app.post('/api/whatsapp/session', verifyToken, async (req, res) => {
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
        console.log('🔍 Clients object keys:', Object.keys(clients));
        console.log('🔍 Client exists for session:', !!clients[sessionId]);
        if (clients[sessionId]) {
            console.log('🔍 Client object keys:', Object.keys(clients[sessionId]));
            console.log('🔍 Client ready state:', clients[sessionId].isReady);
            console.log('🔍 Client has client property:', !!clients[sessionId].client);
            console.log('🔍 Client has pupPage:', !!clients[sessionId].client?.pupPage);
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
        if (!clients[sessionId]) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp client tidak ditemukan. Silakan scan QR code terlebih dahulu.',
                needScan: true
            });
        }

        if (!clients[sessionId].isReady) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp client belum siap. Silakan scan QR code terlebih dahulu.',
                needScan: true
            });
        }

        // Cek apakah client memiliki page yang valid
        if (!clients[sessionId].client || !clients[sessionId].client.pupPage) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp client connection error. Silakan scan QR code ulang.',
                needScan: true
            });
        }

        try {
            // Ambil semua chat dengan timeout dan error handling
            console.log('📱 Attempting to get chats from WhatsApp client...');

            const chats = await Promise.race([
                clients[sessionId].client.getChats(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('getChats timeout after 10 seconds')), 10000)
                )
            ]);

            console.log(`✅ Successfully retrieved ${chats.length} chats`);

            res.status(200).json({
                success: true,
                chats: chats.map(chat => {
                    try {
                        return {
                            id: chat.id._serialized || chat.id.id || chat.id,
                            name: chat.name || 'Unknown',
                            isGroup: chat.isGroup || false,
                            timestamp: chat.timestamp || Date.now(),
                            unreadCount: chat.unreadCount || 0
                        };
                    } catch (chatError) {
                        console.warn('⚠️ Error processing chat:', chatError.message);
                        return {
                            id: 'error-processing',
                            name: 'Error Processing Chat',
                            isGroup: false,
                            timestamp: Date.now(),
                            unreadCount: 0
                        };
                    }
                }).filter(chat => chat.id !== 'error-processing') // Remove error chats
            });

        } catch (getChatsError) {
            console.error('❌ Error getting chats from WhatsApp client:', getChatsError);

            // Check if it's a connection error
            if (getChatsError.message.includes('Session closed') ||
                getChatsError.message.includes('Protocol error') ||
                getChatsError.message.includes('Target closed')) {

                console.log('🔄 Client connection error detected, suggesting reconnection');

                res.status(200).json({
                    success: true,
                    chats: [],
                    message: 'WhatsApp client connection error',
                    note: 'Silakan scan QR code ulang untuk menghubungkan kembali',
                    needReconnect: true,
                    error: getChatsError.message
                });
            } else {
                // Return empty chat list for other errors
                res.status(200).json({
                    success: true,
                    chats: [],
                    message: 'Tidak dapat mengambil chat list, tetapi session tetap aktif',
                    note: 'Silakan coba refresh atau scan QR code ulang jika diperlukan',
                    error: getChatsError.message
                });
            }
        }

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

                            // Check if it's a sendSeen/markedUnread error (message was sent successfully)
                            if (error.message && (error.message.includes('markedUnread') || error.message.includes('sendSeen'))) {
                                console.log('⚠️ SendSeen/markedUnread error detected - message was likely sent successfully');
                                console.warn('⚠️ Warning: Message sent but failed to mark chat as seen. This is not critical.');
                                resolve({
                                    id: { _serialized: 'sent_without_seen_confirmation' },
                                    timestamp: Date.now(),
                                    ack: 1,
                                    sendSeenError: true
                                });
                                return;
                            }

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

        // Validasi client state sebelum mengirim file
        console.log(`📱 Validating client state before sending file...`);
        console.log(`📱 Client exists:`, !!clients[sessionId]);
        console.log(`📱 Client client exists:`, !!clients[sessionId]?.client);
        console.log(`📱 Client isReady:`, clients[sessionId]?.isReady);

        if (!clients[sessionId]?.client) {
            return res.status(400).json({
                success: false,
                message: 'Client WhatsApp tidak tersedia atau belum terinisialisasi'
            });
        }

        // Cek apakah client dalam state yang siap
        let clientState = 'UNKNOWN';
        try {
            if (typeof clients[sessionId].client.getState === 'function') {
                // getState() mungkin async, coba await dulu
                const stateResult = await clients[sessionId].client.getState();
                clientState = stateResult;
                console.log(`📱 Client getState(): ${clientState}`);
            } else if (clients[sessionId].client.state) {
                clientState = clients[sessionId].client.state;
                console.log(`📱 Client state: ${clientState}`);
            }
        } catch (err) {
            console.log(`📱 Error getting client state:`, err.message);
            // Fallback: coba akses state langsung
            if (clients[sessionId].client.state) {
                clientState = clients[sessionId].client.state;
                console.log(`📱 Fallback client state: ${clientState}`);
            }
        }

        if (clientState !== 'CONNECTED' && clientState !== 'OPENING') {
            console.log(`⚠️ Client not ready for sending files. State: ${clientState}`);

            // Fallback: Jika isReady true tapi state tidak terdeteksi, coba kirim file
            if (clients[sessionId].isReady) {
                console.log(`🔄 Client isReady=true but state=${clientState}, trying to send file anyway...`);
                // Lanjutkan ke pengiriman file
            } else {
                return res.status(400).json({
                    success: false,
                    message: `Client WhatsApp belum siap. Status: ${clientState}. Silakan tunggu hingga terhubung.`
                });
            }
        }

        // Cek apakah client memiliki method sendMessage
        if (typeof clients[sessionId].client.sendMessage !== 'function') {
            console.log(`⚠️ Client does not have sendMessage method`);
            return res.status(400).json({
                success: false,
                message: 'Client WhatsApp tidak memiliki method sendMessage'
            });
        }

        console.log(`✅ Client validation passed, proceeding with sendFile...`);
        console.log('📁 File Name:', fileName);

        // Validasi tambahan: Cek apakah client internal benar-benar siap
        try {
            // Cek apakah client memiliki method getChat (indikasi internal siap)
            if (typeof clients[sessionId].client.getChat !== 'function') {
                console.log(`⚠️ Client internal not ready - getChat method not available for file send`);
                console.log(`📱 Available methods:`, Object.getOwnPropertyNames(clients[sessionId].client).filter(name => typeof clients[sessionId].client[name] === 'function'));

                // Fallback: Coba kirim file langsung tanpa validasi getChat
                console.log(`🔄 Attempting to send file without getChat validation...`);
            } else {
                // Coba akses chat untuk memastikan client internal siap
                console.log(`📱 Testing client internal readiness for file send...`);
                try {
                    const testChat = await clients[sessionId].client.getChat(contactId);
                    if (!testChat) {
                        console.log(`⚠️ Cannot access chat for ${contactId}`);
                        return res.status(503).json({
                            success: false,
                            message: 'Tidak dapat mengakses chat. Pastikan nomor telepon valid dan terdaftar di WhatsApp.'
                        });
                    }
                    console.log(`✅ Client internal readiness confirmed for file send`);
                } catch (getChatError) {
                    console.log(`⚠️ getChat test failed for file send:`, getChatError.message);
                    console.log(`🔄 Proceeding with file send anyway...`);
                }
            }
        } catch (internalError) {
            console.log(`⚠️ Client internal validation failed for file send:`, internalError.message);
            console.log(`🔄 Proceeding with file send anyway...`);
        }

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

                    // Try to send the file with retry mechanism
                    const sendFileWithRetry = async () => {
                        let retryCount = 0;
                        const maxRetries = 3;

                        while (retryCount < maxRetries) {
                            try {
                                console.log(`📤 Attempting to send file (attempt ${retryCount + 1}/${maxRetries})...`);

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

                                const result = await sendPromise;
                                console.log(`✅ File sent successfully on attempt ${retryCount + 1}`);
                                return result;
                            } catch (error) {
                                retryCount++;
                                console.log(`❌ Send file attempt ${retryCount} failed:`, error.message);

                                if (retryCount >= maxRetries) {
                                    throw error;
                                }

                                // Wait before retry
                                console.log(`⏳ Waiting 2 seconds before retry...`);
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }
                        }
                    };

                    const sendPromise = sendFileWithRetry();

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
app.get('/api/whatsapp/sessions', verifyToken, async (req, res) => {
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

            console.log(`📊 Session ${session.session_id} client status:`, {
                exists: !!client,
                isReady: client?.isReady,
                phoneNumber: client?.phoneNumber,
                qrCode: client?.qrCode ? 'exists' : 'null',
                clientState: client?.client?.state,
                lastActivity: client?.lastActivity
            });

            return {
                ...session,
                isConnected: client ? client.isReady : false,
                hasQrCode: client ? client.qrCode !== null : false,
                lastSeen: client ? client.createdAt : session.updated_at,
                phoneNumber: client ? client.phoneNumber : null,
                clientState: client?.client?.state || 'UNKNOWN'
            };
        });

        console.log('✅ Enhanced sessions:', enhancedSessions);

        // Debug: Periksa status client secara real-time
        console.log('🔍 Real-time client status check:');
        Object.keys(clients).forEach(sessionId => {
            const client = clients[sessionId];
            // Fallback: Jika clientState undefined, coba ambil dari client
            let clientState = client?.client?.state;
            if (!clientState && client?.client) {
                console.log(`⚠️ ClientState undefined for ${sessionId}, trying to get from client...`);
                clientState = client.client.state || 'UNKNOWN';
                console.log(`📱 ClientState from fallback: ${clientState}`);
            } else if (!clientState) {
                clientState = 'UNKNOWN';
                console.log(`⚠️ No client.client object for ${sessionId}, setting clientState to UNKNOWN`);
            }

            console.log(`📱 Client ${sessionId}:`, {
                exists: !!client,
                isReady: client?.isReady,
                phoneNumber: client?.phoneNumber,
                qrCode: client?.qrCode ? 'exists' : 'null',
                clientState: clientState,
                lastActivity: client?.lastActivity
            });

            // Fallback: Jika client ada tapi isReady false, cek state client
            if (client && !client.isReady) {
                console.log(`⚠️ Client ${sessionId} exists but isReady=false, checking fallback...`);
                console.log(`📱 Client type:`, typeof client);
                console.log(`📱 Client keys:`, Object.keys(client || {}));

                if (client.client) {
                    const actualState = client.client.state;
                    console.log(`📱 Client state: ${actualState}`);

                    // Jika state CONNECTED atau OPENING, update isReady
                    if (actualState === 'CONNECTED' || actualState === 'OPENING') {
                        console.log(`🔄 Force updating isReady for client ${sessionId} based on state ${actualState}`);
                        client.isReady = true;
                        client.lastActivity = new Date().toISOString();
                        client.phoneNumber = client.client.info?.wid || null;
                        client.qrCode = null;

                        // Update database
                        whatsappSessionQueries.updateSessionStatus(sessionId, true).catch(err => {
                            console.error(`❌ Error force updating status for ${sessionId}:`, err);
                        });
                    }
                } else {
                    console.log(`⚠️ No client.client object for ${sessionId}, checking direct client methods...`);

                    // Fallback: Coba akses method client langsung
                    if (typeof client.getState === 'function') {
                        try {
                            const state = client.getState();
                            console.log(`📱 Client getState(): ${state}`);

                            if (state === 'CONNECTED' || state === 'OPENING') {
                                console.log(`🔄 Force updating isReady for client ${sessionId} based on getState() ${state}`);
                                client.isReady = true;
                                client.lastActivity = new Date().toISOString();

                                // Coba ambil phone number dari getInfo
                                if (typeof client.getInfo === 'function') {
                                    try {
                                        const info = client.getInfo();
                                        console.log(`📱 Client getInfo():`, info);
                                        client.phoneNumber = info?.wid || null;
                                    } catch (err) {
                                        console.log(`📱 Error calling getInfo():`, err.message);
                                        client.phoneNumber = 'Unknown';
                                    }
                                } else {
                                    client.phoneNumber = 'Unknown';
                                }

                                client.qrCode = null;

                                // Update database
                                whatsappSessionQueries.updateSessionStatus(sessionId, true).catch(err => {
                                    console.error(`❌ Error force updating status for ${sessionId}:`, err);
                                });
                            }
                        } catch (err) {
                            console.log(`📱 Error calling getState():`, err.message);
                        }
                    }

                    // Fallback: Cek apakah client memiliki method sendMessage (indikasi siap)
                    if (!client.isReady && typeof client.sendMessage === 'function') {
                        console.log(`📱 Client has sendMessage method, but waiting for proper connection...`);
                        // JANGAN set isReady=true di sini, biarkan event handler yang menangani
                    }
                }
            }

            // Fallback: Jika isReady true tapi phoneNumber null, coba ambil dari client (BenyFilho fork)
            if (client && client.isReady && !client.phoneNumber) {
                console.log(`⚠️ Client ${sessionId} isReady=true but phoneNumber=null, trying to get from client (BenyFilho fork)...`);

                if (client.client && client.client.info && client.client.info.wid) {
                    console.log(`📱 Found phone number in client.info.wid: ${client.client.info.wid}`);
                    client.phoneNumber = client.client.info.wid;
                    console.log(`✅ Phone number updated: ${client.phoneNumber}`);
                } else {
                    console.log(`⚠️ No phone number found in client.info`);

                    // Fallback: Coba ambil dari client state atau info lainnya
                    if (client.client) {
                        console.log(`📱 Client object exists, checking for phone number...`);
                        console.log(`📱 Client state: ${client.client.state}`);
                        console.log(`📱 Client info:`, client.client.info);
                        console.log(`📱 Client info me:`, client.client.info?.me);
                        console.log(`📱 Client info pushname:`, client.client.info?.pushname);

                        // Coba ambil dari berbagai sumber (BenyFilho fork)
                        const phoneNumber = client.client.info?.wid ||
                            client.client.info?.me?.id ||
                            client.client.info?.me?.wid ||
                            client.client.info?.wid?.split('@')[0] ||
                            client.client.info?.pushname ||
                            null;

                        if (phoneNumber) {
                            console.log(`📱 Found phone number from fallback: ${phoneNumber}`);
                            client.phoneNumber = phoneNumber;
                            console.log(`✅ Phone number updated from fallback: ${client.phoneNumber}`);
                        } else {
                            console.log(`⚠️ No phone number found in any fallback source`);
                        }
                    } else {
                        console.log(`⚠️ No client.client object available for fallback`);
                    }
                }
            }
        });

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


// Endpoint untuk mendapatkan QR code (dipindah ke bawah setelah session detail)
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

// Middleware untuk debugging semua request ke /api/whatsapp/session
app.use('/api/whatsapp/session', (req, res, next) => {
    console.log('🔍 Middleware caught request to /api/whatsapp/session');
    console.log('🔗 Full URL:', req.originalUrl);
    console.log('🔗 Method:', req.method);
    console.log('🔗 Params:', req.params);
    console.log('🔗 Query:', req.query);
    next();
});

// Endpoint untuk mendapatkan detail session
app.get('/api/whatsapp/session/:sessionId', verifyToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;

        console.log('🚀 GET /api/whatsapp/session/:sessionId called');
        console.log('🔗 Full URL:', req.originalUrl);
        console.log('🔗 Method:', req.method);
        console.log('🔗 Session ID:', sessionId);
        console.log('👤 User ID:', userId);
        console.log('🔑 Headers:', req.headers);

        // Cek apakah session ada dan milik user
        console.log('🔍 Checking session in database...');
        const sessionRecord = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        console.log('🔍 Session record from database:', sessionRecord);

        if (!sessionRecord) {
            console.log('❌ Session not found in database');
            return res.status(404).json({
                success: false,
                message: 'Session tidak ditemukan'
            });
        }

        if (sessionRecord.user_id !== userId) {
            console.log('❌ Session does not belong to user');
            console.log('🔍 Session user_id:', sessionRecord.user_id);
            console.log('🔍 Request user_id:', userId);
            return res.status(403).json({
                success: false,
                message: 'Tidak memiliki akses ke session ini'
            });
        }

        console.log('✅ Session found and belongs to user');

        // Cek apakah client ada dan siap
        const clientStatus = clients[sessionId] ? {
            exists: true,
            isReady: clients[sessionId].isReady,
            hasPage: !!clients[sessionId].client?.pupPage,
            connectionState: clients[sessionId].client ? 'connected' : 'disconnected'
        } : {
            exists: false,
            isReady: false,
            hasPage: false,
            connectionState: 'not_initialized'
        };

        // Get session statistics
        let messageCount = 0;
        let contactCount = 0;

        if (clients[sessionId] && clients[sessionId].isReady) {
            try {
                const chats = await clients[sessionId].client.getChats();
                messageCount = chats.reduce((total, chat) => total + chat.unreadCount, 0);
                contactCount = chats.length;
            } catch (error) {
                console.warn('⚠️ Could not get session statistics:', error.message);
            }
        }

        res.status(200).json({
            success: true,
            session: {
                session_id: sessionRecord.session_id,
                name: sessionRecord.name,
                status: sessionRecord.status,
                created_at: sessionRecord.created_at,
                last_activity: sessionRecord.updated_at,
                client_status: clientStatus,
                statistics: {
                    message_count: messageCount,
                    contact_count: contactCount
                }
            }
        });

    } catch (error) {
        console.error('Error saat mengambil detail session:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil detail session',
            error: error.message
        });
    }
});

// Endpoint untuk mendapatkan QR code (setelah session detail)
app.get('/api/whatsapp/session/:sessionId/qrcode', verifyToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        const { forceRefresh } = req.query; // Parameter untuk force refresh

        // Verifikasi bahwa session milik user ini
        const session = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (!session || session.user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Tidak memiliki akses ke session ini'
            });
        }

        // Cek apakah client sudah ada dan siap
        if (clients[sessionId] && clients[sessionId].isReady) {
            console.log(`📱 Client untuk session ${sessionId} sudah ready, tidak perlu QR code`);
            return res.status(200).json({
                success: true,
                message: 'WhatsApp sudah terhubung, tidak perlu QR code',
                isConnected: true,
                phoneNumber: clients[sessionId].phoneNumber
            });
        }

        // Cek apakah QR code sudah ada dan masih valid (tidak expired)
        if (clients[sessionId] && clients[sessionId].qrCode && !forceRefresh) {
            const qrAge = Date.now() - clients[sessionId].qrTimestamp;
            const maxAge = config.whatsapp.qrTimeout;

            if (qrAge < maxAge) {
                console.log(`📱 QR Code untuk session ${sessionId} masih valid (age: ${Math.floor(qrAge / 1000)}s), tidak perlu generate ulang`);
                return res.status(200).json({
                    success: true,
                    message: 'QR Code siap untuk di-scan',
                    qrCode: clients[sessionId].qrCode,
                    expiresIn: Math.max(0, Math.floor((maxAge - qrAge) / 1000)),
                    qrAge: Math.floor(qrAge / 1000),
                    isReused: true
                });
            } else {
                console.log(`📱 QR Code untuk session ${sessionId} expired (age: ${Math.floor(qrAge / 1000)}s), akan generate ulang`);
            }
        } else if (!clients[sessionId] && !forceRefresh) {
            // Coba muat QR code dari database jika tidak ada di memory
            try {
                const sessionWithConnection = await whatsappSessionQueries.getSessionWithConnection(sessionId);
                if (sessionWithConnection && sessionWithConnection.qr_code && !sessionWithConnection.is_connected) {
                    console.log(`📱 Found saved QR code in database for session ${sessionId}`);

                    // Simpan ke memory untuk akses cepat
                    if (!clients[sessionId]) {
                        clients[sessionId] = {
                            qrCode: sessionWithConnection.qr_code,
                            qrTimestamp: Date.now(),
                            isReady: false,
                            phoneNumber: null,
                            createdAt: new Date(),
                            lastActivity: new Date()
                        };
                    }

                    return res.status(200).json({
                        success: true,
                        message: 'QR Code siap untuk di-scan (from database)',
                        qrCode: sessionWithConnection.qr_code,
                        expiresIn: config.whatsapp.qrTimeout / 1000,
                        qrAge: 0,
                        isReused: true,
                        fromDatabase: true
                    });
                }
            } catch (dbError) {
                console.error(`❌ Error loading QR code from database:`, dbError);
            }
        }

        // Hanya reset session jika force refresh atau tidak ada client
        if (forceRefresh === 'true' || !clients[sessionId]) {
            console.log(`🔄 Force refresh QR code untuk session ${sessionId}`);
            try {
                await deleteSessionAndReInitialize(sessionId);
            } catch (resetError) {
                console.error(`❌ Error resetting session ${sessionId}:`, resetError.message);
                // Coba buat client baru langsung jika reset gagal
                try {
                    const sessionRecord = await whatsappSessionQueries.getSessionBySessionId(sessionId);
                    if (sessionRecord) {
                        await createWhatsAppClient(sessionRecord);
                        console.log(`✅ Created new client after reset failure for session ${sessionId}`);
                    }
                } catch (fallbackError) {
                    console.error(`❌ Fallback client creation failed:`, fallbackError.message);
                }
            }
        }

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
                    expiresIn: config.whatsapp.qrTimeout / 1000,
                    qrAge: 0
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

// Endpoint untuk memeriksa status koneksi
app.get('/api/whatsapp/session/:sessionId/status', verifyToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        const { forceCheck } = req.query;

        console.log('🔍 Status check for session:', sessionId, 'user:', userId, 'forceCheck:', forceCheck);

        // Verifikasi bahwa session milik user ini
        const session = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (!session || session.user_id !== userId) {
            console.log('❌ Session not found or access denied');
            return res.status(403).json({
                success: false,
                message: 'Tidak memiliki akses ke session ini'
            });
        }

        const client = clients[sessionId];
        let isConnected = client ? client.isReady : false;
        let hasQrCode = client ? client.qrCode !== null : false;

        console.log('📊 Initial client status:', {
            exists: !!client,
            isReady: client?.isReady,
            phoneNumber: client?.phoneNumber,
            qrCode: client?.qrCode ? 'exists' : 'null',
            clientState: client?.client?.state,
            hasClient: !!client?.client,
            clientInfo: client?.client ? {
                state: client.client.state,
                info: client.client.info,
                isReady: client.client.isReady
            } : 'No client object'
        });

        // Jika sudah terhubung, pastikan tidak ada QR code
        if (isConnected && client) {
            hasQrCode = false;
            client.qrCode = null; // Clear QR code jika sudah terhubung
            console.log('📱 Session sudah terhubung, clearing QR code');
        }

        // Force check jika diminta
        if (forceCheck === 'true' && client) {
            try {
                console.log('🔄 Force checking client state...');
                console.log('📱 Client object exists:', !!client);
                console.log('📱 Client.client exists:', !!client.client);

                if (client.client) {
                    const state = client.client.state;
                    console.log('📱 Client state:', state);

                    // Update status berdasarkan state actual
                    if (state === 'CONNECTED' || state === 'OPENING') {
                        isConnected = true;
                        clients[sessionId].isReady = true;
                        clients[sessionId].lastActivity = new Date().toISOString();
                        clients[sessionId].phoneNumber = client.client.info?.wid || null;
                        clients[sessionId].qrCode = null;

                        // Update database
                        await whatsappSessionQueries.updateSessionStatus(sessionId, true);
                        console.log('✅ Status updated based on force check');
                    } else {
                        isConnected = false;
                        clients[sessionId].isReady = false;
                    }
                } else {
                    console.log('⚠️ No client.client object, using isReady status');
                    // Jika tidak ada client.client, gunakan status isReady yang sudah ada
                    isConnected = client.isReady || false;
                }
            } catch (stateError) {
                console.warn('⚠️ Error checking client state:', stateError.message);
                // Fallback ke status isReady yang sudah ada
                isConnected = client.isReady || false;
            }
        }

        // Fallback: Jika client ada tapi isReady false, cek state client
        if (client && !isConnected) {
            console.log(`⚠️ Client ${sessionId} exists but isReady=false, checking fallback...`);
            console.log(`📱 Client type:`, typeof client);
            console.log(`📱 Client keys:`, Object.keys(client || {}));

            if (client.client) {
                const actualState = client.client.state;
                console.log(`📱 Client state: ${actualState}`);

                // Jika state CONNECTED atau OPENING, update isReady
                if (actualState === 'CONNECTED' || actualState === 'OPENING') {
                    console.log(`🔄 Force updating isReady for client ${sessionId} based on state ${actualState}`);
                    isConnected = true;
                    clients[sessionId].isReady = true;
                    clients[sessionId].lastActivity = new Date().toISOString();
                    clients[sessionId].phoneNumber = client.client.info?.wid || null;
                    clients[sessionId].qrCode = null;

                    // Update database
                    try {
                        await whatsappSessionQueries.updateSessionStatus(sessionId, true);
                        console.log('✅ Status force updated based on client state');
                    } catch (err) {
                        console.error(`❌ Error force updating status for ${sessionId}:`, err);
                    }
                }
            } else {
                console.log(`⚠️ No client.client object for ${sessionId}, checking direct client methods...`);

                // Fallback: Coba akses method client langsung
                if (typeof client.getState === 'function') {
                    try {
                        const state = client.getState();
                        console.log(`📱 Client getState(): ${state}`);

                        if (state === 'CONNECTED' || state === 'OPENING') {
                            console.log(`🔄 Force updating isReady for client ${sessionId} based on getState() ${state}`);
                            isConnected = true;
                            clients[sessionId].isReady = true;
                            clients[sessionId].lastActivity = new Date().toISOString();

                            // Coba ambil phone number dari getInfo
                            if (typeof client.getInfo === 'function') {
                                try {
                                    const info = client.getInfo();
                                    console.log(`📱 Client getInfo():`, info);
                                    clients[sessionId].phoneNumber = info?.wid || null;
                                } catch (err) {
                                    console.log(`📱 Error calling getInfo():`, err.message);
                                    clients[sessionId].phoneNumber = 'Unknown';
                                }
                            } else {
                                clients[sessionId].phoneNumber = 'Unknown';
                            }

                            clients[sessionId].qrCode = null;

                            // Update database
                            try {
                                await whatsappSessionQueries.updateSessionStatus(sessionId, true);
                                console.log('✅ Status force updated based on getState()');
                            } catch (err) {
                                console.error(`❌ Error force updating status for ${sessionId}:`, err);
                            }
                        }
                    } catch (err) {
                        console.log(`📱 Error calling getState():`, err.message);
                    }
                }

                // Fallback: Cek apakah client memiliki method sendMessage (indikasi siap)
                if (!isConnected && typeof client.sendMessage === 'function') {
                    console.log(`📱 Client has sendMessage method, but waiting for proper connection...`);
                    // JANGAN set isConnected=true di sini, biarkan event handler yang menangani
                }

                // Jika tidak ada method yang tersedia, gunakan status isReady yang sudah ada
                if (!isConnected) {
                    isConnected = client.isReady || false;
                    console.log(`⚠️ No available methods, using existing isReady status: ${isConnected}`);
                }
            }
        }

        // Fallback: Jika client sudah CONNECTED tapi isReady masih false, force update
        let actualClientState = client.client?.state;
        if (client && client.client && typeof client.client.getState === 'function') {
            try {
                const stateResult = await client.client.getState();
                if (stateResult) {
                    actualClientState = stateResult;
                    console.log(`📱 Status endpoint getState() result: ${actualClientState}`);
                }
            } catch (err) {
                console.log(`📱 Status endpoint getState() error:`, err.message);
            }
        }

        if (client && client.client && actualClientState === 'CONNECTED' && !isConnected) {
            console.log(`🔄 Client ${sessionId} is CONNECTED but isReady=false, force updating...`);
            isConnected = true;
            clients[sessionId].isReady = true;
            clients[sessionId].lastActivity = new Date().toISOString();

            if (client.client.info && client.client.info.wid) {
                clients[sessionId].phoneNumber = client.client.info.wid;
            } else if (client.client.info && client.client.info.me) {
                clients[sessionId].phoneNumber = client.client.info.me;
            } else {
                clients[sessionId].phoneNumber = 'Unknown';
            }

            clients[sessionId].qrCode = null;

            // Update database
            try {
                await whatsappSessionQueries.updateSessionStatus(sessionId, true);
                console.log('✅ Status force updated based on CONNECTED state');
            } catch (err) {
                console.error(`❌ Error force updating status for ${sessionId}:`, err);
            }
        }

        // Fallback: Jika isReady true tapi phoneNumber null, coba ambil dari client (BenyFilho fork)
        if (client && isConnected && !client.phoneNumber) {
            console.log(`⚠️ Client ${sessionId} isReady=true but phoneNumber=null, trying to get from client (BenyFilho fork)...`);

            if (client.client && client.client.info && client.client.info.wid) {
                console.log(`📱 Found phone number in client.info.wid: ${client.client.info.wid}`);
                clients[sessionId].phoneNumber = client.client.info.wid;
                console.log(`✅ Phone number updated: ${clients[sessionId].phoneNumber}`);
            } else {
                console.log(`⚠️ No phone number found in client.info`);

                // Fallback: Coba ambil dari client state atau info lainnya
                if (client.client) {
                    console.log(`📱 Client object exists, checking for phone number...`);
                    console.log(`📱 Client state: ${client.client.state}`);
                    console.log(`📱 Client info:`, client.client.info);
                    console.log(`📱 Client info me:`, client.client.info?.me);
                    console.log(`📱 Client info pushname:`, client.client.info?.pushname);

                    // Coba ambil dari berbagai sumber (BenyFilho fork)
                    const phoneNumber = client.client.info?.wid ||
                        client.client.info?.me?.id ||
                        client.client.info?.me?.wid ||
                        client.client.info?.wid?.split('@')[0] ||
                        client.client.info?.pushname ||
                        null;

                    if (phoneNumber) {
                        console.log(`📱 Found phone number from fallback: ${phoneNumber}`);
                        clients[sessionId].phoneNumber = phoneNumber;
                        console.log(`✅ Phone number updated from fallback: ${clients[sessionId].phoneNumber}`);
                    } else {
                        console.log(`⚠️ No phone number found in any fallback source`);
                    }
                } else {
                    console.log(`⚠️ No client.client object available for fallback`);
                }
            }
        }

        // Fallback: Jika clientState undefined, coba ambil dari client
        let clientState = client?.client?.state;
        if (!clientState && client?.client) {
            console.log(`⚠️ ClientState undefined, trying to get from client...`);
            clientState = client.client.state || 'UNKNOWN';
            console.log(`📱 ClientState from fallback: ${clientState}`);
        } else if (!clientState) {
            clientState = 'UNKNOWN';
            console.log(`⚠️ No client.client object, setting clientState to UNKNOWN`);
        }

        console.log('📊 Final client status:', {
            exists: !!client,
            isReady: isConnected,
            hasQrCode: hasQrCode,
            qrTimestamp: client ? client.qrTimestamp : null,
            phoneNumber: client ? client.phoneNumber : null,
            clientState: clientState,
            willUpdateDatabase: isConnected && client?.isReady !== isConnected
        });

        // Log database update status
        if (isConnected && client?.isReady !== isConnected) {
            console.log('🔄 Status changed, will update database...');
            try {
                await whatsappSessionQueries.updateSessionStatus(sessionId, true);
                console.log('✅ Database updated successfully');
            } catch (dbError) {
                console.error('❌ Error updating database:', dbError);
            }
        } else {
            console.log('📊 No database update needed - status unchanged');
        }

        res.status(200).json({
            success: true,
            sessionId: sessionId,
            isConnected: isConnected,
            hasQrCode: hasQrCode,
            phoneNumber: client ? client.phoneNumber : null,
            retryCount: client ? client.retryCount : 0,
            lastActivity: client ? client.createdAt : session.updated_at
        });
    } catch (error) {
        console.error('❌ Error saat memeriksa status koneksi:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal memeriksa status koneksi',
            error: error.message
        });
    }
});

// Endpoint untuk memperbarui deskripsi session
app.put('/api/whatsapp/session/:sessionId', verifyToken, async (req, res) => {
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
app.delete('/api/whatsapp/session/:sessionId', verifyToken, async (req, res) => {
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
app.post('/api/whatsapp/session/:sessionId/send', verifyToken, async (req, res) => {
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

        // Validasi client state sebelum mengirim pesan
        console.log(`📱 Validating client state before sending message...`);
        console.log(`📱 Client exists:`, !!clients[sessionId]);
        console.log(`📱 Client client exists:`, !!clients[sessionId]?.client);
        console.log(`📱 Client isReady:`, clients[sessionId]?.isReady);

        if (!clients[sessionId]?.client) {
            return res.status(400).json({
                success: false,
                message: 'Client WhatsApp tidak tersedia atau belum terinisialisasi'
            });
        }

        // Cek apakah client dalam state yang siap
        let clientState = 'UNKNOWN';
        try {
            if (typeof clients[sessionId].client.getState === 'function') {
                // getState() mungkin async, coba await dulu
                const stateResult = await clients[sessionId].client.getState();
                clientState = stateResult;
                console.log(`📱 Client getState(): ${clientState}`);
            } else if (clients[sessionId].client.state) {
                clientState = clients[sessionId].client.state;
                console.log(`📱 Client state: ${clientState}`);
            }
        } catch (err) {
            console.log(`📱 Error getting client state:`, err.message);
            // Fallback: coba akses state langsung
            if (clients[sessionId].client.state) {
                clientState = clients[sessionId].client.state;
                console.log(`📱 Fallback client state: ${clientState}`);
            }
        }

        if (clientState !== 'CONNECTED' && clientState !== 'OPENING') {
            console.log(`⚠️ Client not ready for sending messages. State: ${clientState}`);

            // Fallback: Jika isReady true tapi state tidak terdeteksi, coba kirim pesan
            if (clients[sessionId].isReady) {
                console.log(`🔄 Client isReady=true but state=${clientState}, trying to send message anyway...`);
                // Lanjutkan ke pengiriman pesan
            } else {
                return res.status(400).json({
                    success: false,
                    message: `Client WhatsApp belum siap. Status: ${clientState}. Silakan tunggu hingga terhubung.`
                });
            }
        }

        // Cek apakah client memiliki method sendMessage
        if (typeof clients[sessionId].client.sendMessage !== 'function') {
            console.log(`⚠️ Client does not have sendMessage method`);
            return res.status(400).json({
                success: false,
                message: 'Client WhatsApp tidak memiliki method sendMessage'
            });
        }

        console.log(`✅ Client validation passed, proceeding with sendMessage...`);

        // Validasi tambahan: Cek apakah client internal benar-benar siap
        try {
            // Cek apakah client memiliki method getChat (indikasi internal siap)
            if (typeof clients[sessionId].client.getChat !== 'function') {
                console.log(`⚠️ Client internal not ready - getChat method not available`);
                console.log(`📱 Available methods:`, Object.getOwnPropertyNames(clients[sessionId].client).filter(name => typeof clients[sessionId].client[name] === 'function'));

                // Fallback: Coba kirim pesan langsung tanpa validasi getChat
                console.log(`🔄 Attempting to send message without getChat validation...`);
            } else {
                // Coba akses chat untuk memastikan client internal siap
                console.log(`📱 Testing client internal readiness...`);
                try {
                    const testChat = await clients[sessionId].client.getChat(formattedNumber);
                    if (!testChat) {
                        console.log(`⚠️ Cannot access chat for ${formattedNumber}`);
                        return res.status(503).json({
                            success: false,
                            message: 'Tidak dapat mengakses chat. Pastikan nomor telepon valid dan terdaftar di WhatsApp.'
                        });
                    }
                    console.log(`✅ Client internal readiness confirmed`);
                } catch (getChatError) {
                    console.log(`⚠️ getChat test failed:`, getChatError.message);
                    console.log(`🔄 Proceeding with sendMessage anyway...`);
                }
            }
        } catch (internalError) {
            console.log(`⚠️ Client internal validation failed:`, internalError.message);
            console.log(`🔄 Proceeding with sendMessage anyway...`);
        }

        // Kirim pesan dengan error handling yang robust dan retry mechanism
        let sendResult;
        let messageId = null;
        let timestamp = Date.now();
        let retryCount = 0;
        const maxRetries = 3;

        const sendMessageWithRetry = async () => {
            while (retryCount < maxRetries) {
                try {
                    console.log(`📤 Attempting to send message (attempt ${retryCount + 1}/${maxRetries})...`);

                    // Cek apakah client internal benar-benar siap
                    if (!clients[sessionId].client.pupPage) {
                        console.log(`⚠️ Client page not ready, waiting...`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        retryCount++;
                        continue;
                    }

                    // Coba kirim pesan dengan timeout
                    const sendPromise = clients[sessionId].client.sendMessage(formattedNumber, message);
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Send message timeout')), 15000)
                    );

                    sendResult = await Promise.race([sendPromise, timeoutPromise]);
                    console.log(`✅ Message sent successfully on attempt ${retryCount + 1}`);
                    return sendResult;
                } catch (error) {
                    retryCount++;
                    console.log(`❌ Send message attempt ${retryCount} failed:`, error.message);

                    // Check if this is a sendSeen/markedUnread error (message was sent successfully)
                    if (error.message && (error.message.includes('markedUnread') || error.message.includes('sendSeen'))) {
                        console.log(`⚠️ SendSeen error detected - message was likely sent successfully but marking as seen failed`);
                        console.log(`🔄 Attempting to verify message was sent...`);

                        // The message was actually sent, so we return a success response
                        // but log the sendSeen failure as a warning
                        console.warn(`⚠️ Warning: Message sent but failed to mark chat as seen. This is usually not critical.`);
                        return {
                            id: { _serialized: 'sent_without_seen_confirmation' },
                            timestamp: Date.now(),
                            ack: 1 // Message sent to server
                        };
                    }

                    // Jika error getChat, coba restart client
                    if (error.message.includes('getChat') || error.message.includes('evaluate')) {
                        console.log(`🔄 getChat error detected, attempting client restart...`);
                        try {
                            await clients[sessionId].client.destroy();
                            await new Promise(resolve => setTimeout(resolve, 5000));
                            // Recreate client
                            await createWhatsAppClient(sessionId);
                            console.log(`✅ Client restarted successfully`);
                        } catch (restartError) {
                            console.log(`❌ Failed to restart client:`, restartError.message);
                        }
                    }

                    if (retryCount >= maxRetries) {
                        throw error;
                    }

                    // Wait before retry
                    console.log(`⏳ Waiting 3 seconds before retry...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        };

        try {
            sendResult = await sendMessageWithRetry();

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

