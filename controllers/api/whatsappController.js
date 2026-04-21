// controllers/api/whatsappController.js
const WhatsAppService = require('../../services/WhatsAppService');
const { whatsappSessionQueries } = require('../../db');
const config = require('../../config/config');
const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const { v4: uuidv4 } = require('uuid');

const whatsappController = {
    // === SESSION MANAGEMENT ===

    createSession: async (req, res) => {
        try {
            let { sessionId, description } = req.body;
            const userId = req.user.id;

            if (!sessionId) {
                sessionId = uuidv4(); // Auto generate session ID jika tidak dikirim dari UI
            }

            const existingSession = await whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (existingSession) {
                return res.status(400).json({ success: false, message: 'Session ID sudah digunakan' });
            }

            const session = await whatsappSessionQueries.createSession(userId, sessionId, description);

            WhatsAppService.createWhatsAppClient(session).catch(err => {
                console.error(`Error initializing client for ${sessionId}:`, err.message);
            });

            res.status(201).json({
                success: true,
                message: 'Session berhasil dibuat dan sedang diinisialisasi',
                session: session
            });
        } catch (error) {
            console.error('Error in createSession:', error);
            res.status(500).json({ success: false, message: 'Gagal membuat session', error: error.message });
        }
    },

    getSessions: async (req, res) => {
        try {
            const userId = req.user.id;
            const sessions = await whatsappSessionQueries.getSessionsByUserId(userId);
            
            const enhancedSessions = sessions.map(session => {
                const clientData = WhatsAppService.getClient(session.session_id);
                return {
                    ...session,
                    isConnected: clientData ? clientData.isReady : false,
                    hasQrCode: clientData ? clientData.qrCode !== null : false,
                    phoneNumber: clientData ? clientData.phoneNumber : null,
                    clientState: clientData?.client?.state || 'UNKNOWN'
                };
            });

            res.status(200).json({ success: true, sessions: enhancedSessions });
        } catch (error) {
            console.error('Error in getSessions:', error);
            res.status(500).json({ success: false, message: 'Gagal mengambil daftar session' });
        }
    },

    getSessionDetail: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;

            const session = await whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (!session || session.user_id !== userId) {
                return res.status(404).json({ success: false, message: 'Session tidak ditemukan' });
            }

            const clientData = WhatsAppService.getClient(sessionId);
            const clientStatus = clientData ? {
                exists: true,
                isReady: clientData.isReady,
                connectionState: clientData.client ? 'connected' : 'disconnected'
            } : {
                exists: false,
                isReady: false,
                connectionState: 'not_initialized'
            };

            res.status(200).json({
                success: true,
                session: {
                    ...session,
                    client_status: clientStatus
                }
            });
        } catch (error) {
            console.error('Error in getSessionDetail:', error);
            res.status(500).json({ success: false, message: 'Gagal mengambil detail session' });
        }
    },

    getQrCode: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;
            const { forceRefresh } = req.query;

            const session = await whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (!session || session.user_id !== userId) {
                return res.status(403).json({ success: false, message: 'Akses ditolak' });
            }

            const clientData = WhatsAppService.getClient(sessionId);

            if (clientData && clientData.isReady) {
                return res.status(200).json({
                    success: true,
                    message: 'WhatsApp sudah terhubung',
                    isConnected: true,
                    phoneNumber: clientData.phoneNumber
                });
            }

            if (forceRefresh === 'true' || !clientData) {
                await WhatsAppService.deleteSessionAndReInitialize(sessionId);
            }

            const maxWaitTime = config.whatsapp?.qrTimeout || 20000;
            const interval = 1000;
            let waited = 0;

            const checkQr = async () => {
                const currentClient = WhatsAppService.getClient(sessionId);
                if (currentClient?.qrCode) {
                    return res.status(200).json({
                        success: true,
                        qrCode: currentClient.qrCode,
                        expiresIn: (maxWaitTime - (Date.now() - currentClient.qrTimestamp)) / 1000
                    });
                }
                
                if (waited >= maxWaitTime) {
                    return res.status(408).json({ success: false, message: 'Timeout menunggu QR code' });
                }

                waited += interval;
                setTimeout(checkQr, interval);
            };

            checkQr();
        } catch (error) {
            console.error('Error in getQrCode:', error);
            res.status(500).json({ success: false, message: 'Gagal mengambil QR code' });
        }
    },

    getConnectionStatus: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;

            const session = await whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (!session || session.user_id !== userId) {
                return res.status(403).json({ success: false, message: 'Akses ditolak' });
            }

            const clientData = WhatsAppService.getClient(sessionId);
            
            res.status(200).json({
                success: true,
                isConnected: clientData ? clientData.isReady : false,
                phoneNumber: clientData ? clientData.phoneNumber : null,
                clientState: clientData?.client?.state || 'UNKNOWN'
            });
        } catch (error) {
            console.error('Error in getConnectionStatus:', error);
            res.status(500).json({ success: false, message: 'Gagal mengambil status koneksi' });
        }
    },

    updateSession: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const { description } = req.body;
            const updated = await whatsappSessionQueries.updateSessionDescription(sessionId, description);
            res.status(200).json({ success: true, message: 'Session diperbarui', session: updated });
        } catch (error) {
            console.error('Error in updateSession:', error);
            res.status(500).json({ success: false, message: 'Gagal memperbarui session' });
        }
    },

    deleteSession: async (req, res) => {
        try {
            const { sessionId } = req.params;

            // 1. Hapus dari database terlebih dahulu JANGAN DIBALIK
            await whatsappSessionQueries.deleteSession(sessionId);

            // 2. Hancurkan client di background tanpa diawait
            WhatsAppService.deleteSessionAndReInitialize(sessionId).catch(err => {
                console.error(`Status background terminate untuk ${sessionId}:`, err.message);
            });

            // 3. Langsung kembalikan respons OK ke UI sehingga tidak lagging
            res.status(200).json({ success: true, message: 'Session dihapus' });
        } catch (error) {
            console.error('Error in deleteSession:', error);
            res.status(500).json({ success: false, message: 'Gagal menghapus session' });
        }
    },

    // === MESSAGING ===

    sendMessage: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const { number, message } = req.body;

            const clientData = WhatsAppService.getClient(sessionId);
            if (!clientData || !clientData.isReady) {
                return res.status(503).json({ success: false, message: 'Client belum siap' });
            }

            let formattedNumber = number.replace(/\D/g, '');
            if (!formattedNumber.endsWith('@c.us')) formattedNumber += '@c.us';

            let sendResult;
            let messageId = null;
            let timestamp = Date.now();
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
                try {
                    sendResult = await clientData.client.sendMessage(formattedNumber, message);
                    break;
                } catch (error) {
                    retryCount++;
                    if (retryCount >= maxRetries) {
                        if (error.message?.includes('serialize')) {
                            messageId = 'sent_no_id';
                            break;
                        }
                        throw error;
                    }
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            if (!messageId && sendResult) {
                messageId = sendResult.id?._serialized || 'unknown';
                timestamp = sendResult.timestamp || Date.now();
            }

            res.status(200).json({
                success: true,
                message: messageId === 'sent_no_id' ? 'Pesan terkirim (tanpa ID)' : 'Pesan terkirim',
                data: { id: messageId, timestamp, to: formattedNumber }
            });
        } catch (error) {
            console.error('Error in sendMessage:', error);
            res.status(500).json({ success: false, message: 'Gagal mengirim pesan', error: error.message });
        }
    },

    getChats: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const clientData = WhatsAppService.getClient(sessionId);
            
            if (!clientData || !clientData.isReady) {
                return res.status(503).json({ success: false, message: 'Client belum siap' });
            }

            const chats = await clientData.client.getChats();
            const formatted = chats.map(c => ({
                id: c.id._serialized,
                name: c.name || c.id.user || 'Tanpa Nama',
                number: c.id.user || c.id._serialized,
                isGroup: c.isGroup,
                unreadCount: c.unreadCount,
                timestamp: c.timestamp
            }));

            res.status(200).json({ success: true, chats: formatted });
        } catch (error) {
            console.error('Error in getChats:', error);
            res.status(500).json({ success: false, message: 'Gagal mengambil daftar obrolan' });
        }
    },

    getChatMessages: async (req, res) => {
        try {
            const { sessionId, contactId } = req.params;
            const clientData = WhatsAppService.getClient(sessionId);
            
            if (!clientData || !clientData.isReady) {
                return res.status(503).json({ success: false, message: 'Client belum siap' });
            }

            const chat = await clientData.client.getChatById(contactId);
            if (!chat) {
                return res.status(404).json({ success: false, message: 'Obrolan tidak ditemukan' });
            }

            // Workaround for whatsapp-web.js bug "Cannot read properties of undefined (reading 'waitForChatLoading')" 
            // This bug is triggered when fetchMessages calls loadEarlierMsgs internally if a limit is passed.
            // By fetching without a predefined limit, it pulls from Whatsapp-Web's current memory gracefully.
            let messages = [];
            try {
                messages = await chat.fetchMessages({ limit: 50 });
            } catch (err) {
                console.warn('⚠️ fetchMessages with limit failed, trying fallback to memory-only fetch...', err.message);
                const allMessages = await chat.fetchMessages({});
                messages = allMessages.slice(-50); // manually limit to 50
            }
            
            // Format messages for frontend
            const formattedMessages = await Promise.all(messages.map(async (msg) => {
                let mediaData = null;
                
                // Optional: Download media if it has media and isn't too large
                // Only fetching if explicitly needed, otherwise we just indicate it has media
                // For performance, we might skip full media download for lists unless requested
                
                return {
                    id: msg.id._serialized,
                    body: msg.body,
                    timestamp: msg.timestamp,
                    fromMe: msg.fromMe,
                    hasMedia: msg.hasMedia,
                    type: msg.type,
                    // mediaData skipped by default to optimize loading
                };
            }));

            res.status(200).json({ success: true, messages: formattedMessages });
        } catch (error) {
            console.error('Error in getChatMessages:', error);
            res.status(500).json({ success: false, message: 'Gagal mengambil pesan obrolan' });
        }
    },

    sendChatMessage: async (req, res) => {
        try {
            const { sessionId, contactId } = req.params;
            const { message } = req.body;

            const clientData = WhatsAppService.getClient(sessionId);
            if (!clientData || !clientData.isReady) {
                return res.status(503).json({ success: false, message: 'Client belum siap' });
            }

            const sendResult = await clientData.client.sendMessage(contactId, message);
            
            res.status(200).json({
                success: true,
                message: 'Pesan terkirim',
                data: { 
                    id: sendResult.id?._serialized || 'unknown', 
                    timestamp: sendResult.timestamp || Date.now(), 
                    to: contactId 
                }
            });
        } catch (error) {
            console.error('Error in sendChatMessage:', error);
            res.status(500).json({ success: false, message: 'Gagal mengirim pesan', error: error.message });
        }
    },

    sendFile: async (req, res) => {
        try {
            const { sessionId, contactId } = req.params;
            const { message, fileType, fileName, fileData } = req.body;

            const clientData = WhatsAppService.getClient(sessionId);
            if (!clientData || !clientData.isReady) {
                return res.status(503).json({ success: false, message: 'Client belum siap' });
            }

            const buffer = Buffer.from(fileData, 'base64');
            const tempDir = path.join(__dirname, '../../temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            
            const tempFilePath = path.join(tempDir, `${Date.now()}_${fileName}`);
            fs.writeFileSync(tempFilePath, buffer);

            try {
                const media = MessageMedia.fromFilePath(tempFilePath);
                const result = await clientData.client.sendMessage(contactId, media, { caption: message || '' });
                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

                res.status(200).json({
                    success: true,
                    message: 'File terkirim',
                    messageId: result.id?._serialized || 'unknown',
                    timestamp: result.timestamp
                });
            } catch (sendError) {
                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                if (sendError.message?.includes('serialize')) {
                    return res.status(200).json({ success: true, message: 'File terkirim (tanpa ID)', messageId: 'sent_no_id', timestamp: Date.now() });
                }
                throw sendError;
            }
        } catch (error) {
            console.error('Error in sendFile:', error);
            res.status(500).json({ success: false, message: 'Gagal mengirim file', error: error.message });
        }
    },

    getContacts: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const clientData = WhatsAppService.getClient(sessionId);
            if (!clientData || !clientData.isReady) {
                return res.status(503).json({ success: false, message: 'Client belum siap' });
            }

            const contacts = await clientData.client.getContacts();
            const formatted = contacts
                .filter(c => c.id.server === 'c.us')
                .map(c => ({
                    id: c.id._serialized,
                    name: c.name || c.pushname || 'Tanpa Nama',
                    number: c.number
                }));

            res.status(200).json({ success: true, contacts: formatted });
        } catch (error) {
            console.error('Error in getContacts:', error);
            res.status(500).json({ success: false, message: 'Gagal mengambil kontak' });
        }
    }
};

module.exports = whatsappController;
