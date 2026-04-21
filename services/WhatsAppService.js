// services/WhatsAppService.js
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const { whatsappSessionQueries } = require('../db');

class WhatsAppService {
    constructor() {
        this.clients = {};
        this.io = null; // Socket.IO instance
        this.SESSION_DIR = path.join(__dirname, '../.wwebjs_auth');
        
        if (!fs.existsSync(this.SESSION_DIR)) {
            fs.mkdirSync(this.SESSION_DIR, { recursive: true });
        }
    }

    setIo(io) {
        this.io = io;
    }

    // Helper functions for directory management
    removeDirectoryWithRetry(dirPath, retries = 5, delay = 2000) {
        return new Promise((resolve, reject) => {
            const attempt = async (n) => {
                try {
                    if (fs.existsSync(dirPath)) {
                        fs.rmSync(dirPath, { recursive: true, force: true });
                    }
                    resolve();
                } catch (err) {
                    if (n > 0) {
                        console.log(`⚠️ Retry removing directory ${dirPath} (attempt ${6-n}/5)...`);
                        setTimeout(() => attempt(n - 1), delay);
                    } else {
                        reject(err);
                    }
                }
            };
            attempt(retries);
        });
    }

    async removeDirectoryContents(dirPath) {
        if (!fs.existsSync(dirPath)) return;
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const curPath = path.join(dirPath, file);
            try {
                if (fs.lstatSync(curPath).isDirectory()) {
                    await this.removeDirectoryContents(curPath);
                    fs.rmdirSync(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            } catch (err) {
                console.warn(`⚠️ Failed to remove ${curPath}: ${err.message}`);
            }
        }
    }

    async createWhatsAppClient(session) {
        const sessionId = session.session_id;
        const userId = session.user_id;

        console.log(`🚀 Initializing WhatsApp client for session: ${sessionId}`);

        // Cleanup existing client if any
        if (this.clients[sessionId] && this.clients[sessionId].client) {
            try {
                await this.clients[sessionId].client.destroy();
            } catch (err) {
                console.error(`Error destroying existing client for ${sessionId}:`, err.message);
            }
        }

        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: `session-${sessionId}`,
                dataPath: this.SESSION_DIR
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                // executionContext: 'isolated'
            }
        });

        // Initialize client object in memory
        this.clients[sessionId] = {
            client: client,
            isReady: false,
            qrCode: null,
            qrTimestamp: null,
            retryCount: 0,
            phoneNumber: null,
            createdAt: new Date(),
            lastActivity: new Date()
        };

        // Event Handlers
        client.on('qr', async (qr) => {
            console.log(`📱 QR Code received for session: ${sessionId}`);
            this.clients[sessionId].qrCode = qr;
            this.clients[sessionId].qrTimestamp = Date.now();
            this.clients[sessionId].isReady = false;

            if (this.io) {
                this.io.to(`session-${sessionId}`).emit('qr', { qr });
            }

            try {
                await whatsappSessionQueries.updateSessionConnection(sessionId, qr, false);
            } catch (err) {
                console.error(`Error saving QR to DB for ${sessionId}:`, err.message);
            }
        });

        client.on('ready', async () => {
            console.log(`✅ WhatsApp client is ready for session: ${sessionId}`);
            this.clients[sessionId].isReady = true;
            this.clients[sessionId].qrCode = null;
            
            let phoneNumber = 'Unknown';
            if (client.info) {
                phoneNumber = client.info.wid || client.info.me || 'Unknown';
            }
            this.clients[sessionId].phoneNumber = phoneNumber;

            if (this.io) {
                this.io.to(`session-${sessionId}`).emit('ready', { 
                    message: 'WhatsApp is connected',
                    phoneNumber: phoneNumber
                });
            }

            try {
                await whatsappSessionQueries.updateSessionConnection(sessionId, null, true, phoneNumber);
            } catch (err) {
                console.error(`Error updating connection status for ${sessionId}:`, err.message);
            }
        });

        client.on('authenticated', () => {
            console.log(`🔐 Authenticated for session: ${sessionId}`);
            if (this.io) {
                this.io.to(`session-${sessionId}`).emit('authenticated', { message: 'Authenticated' });
            }
        });

        client.on('auth_failure', async (msg) => {
            console.error(`❌ Auth failure for session ${sessionId}:`, msg);
            this.clients[sessionId].isReady = false;
            if (this.io) {
                this.io.to(`session-${sessionId}`).emit('auth_failure', { message: msg });
            }
            // Optional: Auto-reconnect or cleanup logic
        });

        client.on('disconnected', async (reason) => {
            console.log(`🔌 Disconnected for session ${sessionId}:`, reason);
            this.clients[sessionId].isReady = false;
            
            if (this.io) {
                this.io.to(`session-${sessionId}`).emit('disconnected', { message: reason });
            }

            try {
                await whatsappSessionQueries.updateSessionStatus(sessionId, false);
            } catch (err) {
                console.error(`Error updating disconnect status for ${sessionId}:`, err.message);
            }
        });

        // Initialize with error handling
        try {
            await client.initialize();
        } catch (err) {
            console.error(`❌ Failed to initialize client for session ${sessionId}:`, err.message);
            // Re-throw or handle as needed
            throw err;
        }

        return this.clients[sessionId];
    }

    async deleteSessionAndReInitialize(sessionId) {
        console.log(`🔄 Resetting session: ${sessionId}`);
        
        // 1. Destroy client if exists
        if (this.clients[sessionId] && this.clients[sessionId].client) {
            try {
                await this.clients[sessionId].client.destroy();
            } catch (err) {
                console.warn(`Warning destroying client for ${sessionId}:`, err.message);
            }
        }

        // 2. Clear from memory
        delete this.clients[sessionId];

        // 3. Remove auth directory
        const sessionDir = path.join(this.SESSION_DIR, `session-session-${sessionId}`);
        if (fs.existsSync(sessionDir)) {
            try {
                await this.removeDirectoryWithRetry(sessionDir);
                console.log(`✅ Removed session directory for ${sessionId}`);
            } catch (err) {
                console.error(`❌ Failed to remove session directory:`, err.message);
            }
        }

        // 4. Re-initialize if record exists
        const sessionRecord = await whatsappSessionQueries.getSessionBySessionId(sessionId);
        if (sessionRecord) {
            return await this.createWhatsAppClient(sessionRecord);
        }
    }

    getClient(sessionId) {
        return this.clients[sessionId];
    }
    
    getAllClients() {
        return this.clients;
    }
}

module.exports = new WhatsAppService();
