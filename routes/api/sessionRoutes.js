const express = require('express');
const router = express.Router();
const { verifyToken } = require('../../middleware/authMiddleware');
const { whatsappSessionQueries } = require('../../db');
const clients = require('../../clients');

// Get all sessions
router.get('/', async (req, res) => {
    try {
        console.log('🔍 Fetching sessions for dashboard...');
        
        // Import clients dari clients.js
        const clients = require('../../clients');
        
        console.log('📱 Clients object:', clients);
        
        if (!clients) {
            console.log('⚠️ No clients found, returning empty array');
            return res.json([]);
        }

        // Convert clients object ke array dengan format yang diperlukan dashboard
        const sessionsData = Object.keys(clients).map(sessionId => {
            const client = clients[sessionId];
            console.log(`📱 Processing session ${sessionId}:`, client);
            
            const sessionData = {
                session_id: sessionId,
                isReady: client.isReady || false,
                phone_number: client.phoneNumber || null,
                last_activity: client.lastActivity || null,
                created_at: client.createdAt || new Date().toISOString(),
                status: client.isReady ? 'ready' : 'disconnected'
            };
            
            console.log(`✅ Processed session ${sessionId}:`, sessionData);
            return sessionData;
        });

        console.log(`📱 Found ${sessionsData.length} sessions:`, sessionsData);
        res.json(sessionsData);
    } catch (error) {
        console.error('❌ Error getting sessions:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get sessions' 
        });
    }
});

// Get session by ID
router.get('/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const clients = require('../../clients');
        
        if (!clients || !clients[sessionId]) {
            return res.status(404).json({ 
                success: false, 
                message: 'Session not found' 
            });
        }

        const client = clients[sessionId];
        const sessionData = {
            session_id: sessionId,
            isReady: client.isReady || false,
            phone_number: client.phoneNumber || null,
            last_activity: client.lastActivity || null,
            created_at: client.createdAt || new Date().toISOString(),
            status: client.isReady ? 'ready' : 'disconnected'
        };

        res.json(sessionData);
    } catch (error) {
        console.error('Error getting session:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get session' 
        });
    }
});

// WhatsApp sessions endpoint
router.get('/whatsapp', verifyToken, async (req, res) => {
    try {
        console.log('🚀 GET /api/sessions/whatsapp called');
        console.log('👤 User ID:', req.user.id);
        console.log('🔑 User object:', req.user);
        
        const userId = req.user.id;
        
        // Dapatkan semua session user dari database
        const sessions = await whatsappSessionQueries.getSessionsByUserId(userId);
        console.log('📱 Database sessions:', sessions);
        
        // Tambahkan status koneksi dari client yang sedang aktif
        const enhancedSessions = sessions.map(session => {
            const client = clients[session.session_id];
            const enhanced = {
                ...session,
                isConnected: client ? client.isReady : false,
                hasQrCode: client ? client.qrCode !== null : false,
                lastSeen: client ? client.createdAt : session.updated_at
            };
            console.log(`📱 Session ${session.session_id}:`, enhanced);
            return enhanced;
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

module.exports = router;
