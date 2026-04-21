// routes/api/contactRoutes.js
const express = require('express');
const router = express.Router();
const { getContacts, getContact } = require('../../controllers/api/contactController');
const { verifyToken } = require('../../middleware/authMiddleware');
const { validateSession, checkConnection } = require('../../middleware/sessionMiddleware'); // Sesuaikan path

// Middleware untuk validasi sesi dan autentikasi
router.use(verifyToken);
router.use('/:sessionId', validateSession);
router.use('/:sessionId', checkConnection);

// Routes
router.get('/:sessionId/contacts', getContacts);
router.get('/:sessionId/contacts/:contactId', getContact);

module.exports = router;