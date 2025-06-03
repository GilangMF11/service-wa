const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/login', authController.showLogin);
router.post('/login', authController.handleLogin);
router.get('/logout', authController.logOut);

router.get('/register', authController.showRegister);
//router.post('/register', authController.handleRegister);

module.exports = router;
