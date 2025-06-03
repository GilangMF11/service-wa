// routes/api/chatRoutes.js
const express = require('express');
const router = express.Router();
const { getChatHistory, getAllChats, sendMessage } = require('../../controllers/api/chatController');
const { authenticateToken } = require('../../auth');
const { validateSession, checkConnection } = require('../../middleware/sessionMiddleware'); // Sesuaikan path

// Middleware untuk validasi sesi dan autentikasi
router.use(authenticateToken);
router.use('/:sessionId', validateSession);
router.use('/:sessionId', checkConnection);

// Routes
router.get('/:sessionId/chats', getAllChats);
router.get('/:sessionId/chats/:contactId', getChatHistory);
router.post('/:sessionId/chats/:contactId', sendMessage);

module.exports = router;