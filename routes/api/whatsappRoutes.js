// routes/api/whatsappRoutes.js
const express = require('express');
const router = express.Router();
const whatsappController = require('../../controllers/api/whatsappController');
const { verifyToken } = require('../../middleware/authMiddleware');

// Session management
router.post('/session', verifyToken, whatsappController.createSession);
router.get('/sessions', verifyToken, whatsappController.getSessions);
router.get('/session/:sessionId', verifyToken, whatsappController.getSessionDetail);
router.get('/session/:sessionId/qrcode', verifyToken, whatsappController.getQrCode);
router.get('/session/:sessionId/status', verifyToken, whatsappController.getConnectionStatus);
router.put('/session/:sessionId', verifyToken, whatsappController.updateSession);
router.delete('/session/:sessionId', verifyToken, whatsappController.deleteSession);

// Messaging
router.post('/session/:sessionId/send', verifyToken, whatsappController.sendMessage);
router.post('/:sessionId/chats/:contactId/file', verifyToken, whatsappController.sendFile);

// Contacts & Chats
router.get('/:sessionId/contacts', verifyToken, whatsappController.getContacts);
router.get('/:sessionId/chats', verifyToken, whatsappController.getChats);
router.get('/:sessionId/chats/:contactId', verifyToken, whatsappController.getChatMessages);
router.post('/:sessionId/chats/:contactId', verifyToken, whatsappController.sendChatMessage);

module.exports = router;
