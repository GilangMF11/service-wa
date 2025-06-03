// routes/api/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../../controllers/api/userController');

// GET /api/users - Ambil semua users dengan pagination dan search
router.get('/', userController.getAllUsers);

// GET /api/users/:id - Ambil user berdasarkan ID
router.get('/:id', userController.getUserById);

// POST /api/users - Buat user baru
router.post('/', userController.createUser);

// PUT /api/users/:id - Update user
router.put('/:id', userController.updateUser);

// DELETE /api/users/:id - Hapus user
router.delete('/:id', userController.deleteUser);

module.exports = router;