// chatController.js
const clients = require('../../clients');

// Get chat history with a contact
const getChatHistory = async (req, res) => {
    try {
        const { sessionId, contactId } = req.params;
        const { limit = 50 } = req.query; // Default 50 pesan terakhir
        // Cek apakah client ada dan terhubung
        if (!clients[sessionId] || !clients[sessionId].isReady) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp client belum siap atau tidak terhubung'
            });
        }
        // Ambil chat
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
            messages: messages.map(msg => ({
                id: msg.id.id,
                body: msg.body,
                fromMe: msg.fromMe,
                author: msg.author || null, // ID pengirim (penting untuk grup)
                timestamp: msg.timestamp,
                hasMedia: msg.hasMedia,
                type: msg.type
            }))
        });
    } catch (error) {
        console.error('Error saat mengambil history chat:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil history chat',
            error: error.message
        });
    }
};

// Get all chats
const getAllChats = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Cek apakah client ada dan terhubung
        if (!clients[sessionId] || !clients[sessionId].isReady) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp client belum siap atau tidak terhubung'
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
};

// Send message to contact
const sendMessage = async (req, res) => {
    try {
        const { sessionId, contactId } = req.params;
        const { message } = req.body;

        if (!clients[sessionId] || !clients[sessionId].isReady) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp client belum siap atau tidak terhubung'
            });
        }

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Pesan harus disediakan'
            });
        }

        const result = await clients[sessionId].client.sendMessage(contactId, message);

        // Emit pesan ke Socket.IO (real-time)
        const { getIO } = require('../../socket');
        const io = getIO();
        io.to(sessionId).emit('receive-message', {
            contactId,
            message,
            fromMe: true,
            timestamp: result.timestamp,
            id: result.id.id
        });

        res.status(200).json({
            success: true,
            message: 'Pesan berhasil dikirim',
            data: {
                id: result.id.id,
                timestamp: result.timestamp
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
};


module.exports = {
    getChatHistory,
    getAllChats,
    sendMessage
};