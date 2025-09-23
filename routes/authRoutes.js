const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { preventAuthAccess } = require('../middleware/authMiddleware');

// Allow access to login page even if already logged in (with warning message)
router.get('/login', authController.showLogin);
router.post('/login', authController.handleLogin);
router.get('/logout', authController.logOut);

router.get('/register', authController.showRegister);
//router.post('/register', authController.handleRegister);

// Test endpoint untuk melihat response API
router.post('/test-login', authController.testLogin);

module.exports = router;
