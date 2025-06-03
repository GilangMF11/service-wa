
// middleware/sessionMiddleware.js
const clients = require('../clients'); // Update import
const { whatsappSessionQueries } = require('../db'); // Sesuaikan path


// Middleware untuk memeriksa jika session ada dalam permintaan
const validateSession = async (req, res, next) => {
    const sessionId = req.params.sessionId;
    
    if (!sessionId) {
        return res.status(400).json({ 
            success: false, 
            message: 'Session ID diperlukan' 
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
        
        // Cek jika session milik user
        if (sessionRecord.user_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses ke session ini'
            });
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
    const sessionId = req.params.sessionId;
    
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

module.exports = {
    validateSession,
    checkConnection
};