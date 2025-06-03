// controllers/api/userController.js
const bcrypt = require('bcrypt');
const { userQueries } = require('../../db');

const userController = {
    // GET /api/users - Ambil semua users
    getAllUsers: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const search = req.query.search || '';
            const offset = (page - 1) * limit;

            const users = await userQueries.getAllUsers(limit, offset, search);
            const totalUsers = await userQueries.getTotalUsers(search);
            const totalPages = Math.ceil(totalUsers / limit);

            res.status(200).json({
                success: true,
                data: {
                    users: users.map(user => ({
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        created_at: user.created_at
                    })),
                    pagination: {
                        currentPage: page,
                        totalPages,
                        totalUsers,
                        hasNextPage: page < totalPages,
                        hasPrevPage: page > 1
                    }
                }
            });
        } catch (error) {
            console.error('Error getting users:', error);
            res.status(500).json({
                success: false,
                message: 'Gagal mengambil data users',
                error: error.message
            });
        }
    },

    // GET /api/users/:id - Ambil user berdasarkan ID
    getUserById: async (req, res) => {
        try {
            const { id } = req.params;
            const user = await userQueries.getUserById(id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User tidak ditemukan'
                });
            }

            res.status(200).json({
                success: true,
                data: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    created_at: user.created_at
                }
            });
        } catch (error) {
            console.error('Error getting user:', error);
            res.status(500).json({
                success: false,
                message: 'Gagal mengambil data user',
                error: error.message
            });
        }
    },

    // POST /api/users - Buat user baru
    createUser: async (req, res) => {
        try {
            const { username, password, email } = req.body;

            // Validasi input
            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Username dan password harus diisi'
                });
            }

            // Cek apakah username sudah ada
            const existingUser = await userQueries.getUserByUsername(username);
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: 'Username sudah digunakan'
                });
            }

            // Cek apakah email sudah ada (jika email diisi)
            if (email) {
                const existingEmail = await userQueries.getUserByEmail(email);
                if (existingEmail) {
                    return res.status(409).json({
                        success: false,
                        message: 'Email sudah digunakan'
                    });
                }
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Buat user baru
            const newUser = await userQueries.createUser(username, hashedPassword, email);

            res.status(201).json({
                success: true,
                message: 'User berhasil dibuat',
                data: {
                    id: newUser.id,
                    username: newUser.username,
                    email: newUser.email,
                    created_at: newUser.created_at
                }
            });
        } catch (error) {
            console.error('Error creating user:', error);
            res.status(500).json({
                success: false,
                message: 'Gagal membuat user',
                error: error.message
            });
        }
    },

    // PUT /api/users/:id - Update user
    updateUser: async (req, res) => {
        try {
            const { id } = req.params;
            const { username, email, password } = req.body;

            // Cek apakah user ada
            const existingUser = await userQueries.getUserById(id);
            if (!existingUser) {
                return res.status(404).json({
                    success: false,
                    message: 'User tidak ditemukan'
                });
            }

            // Validasi username jika diubah
            if (username && username !== existingUser.username) {
                const userWithSameUsername = await userQueries.getUserByUsername(username);
                if (userWithSameUsername) {
                    return res.status(409).json({
                        success: false,
                        message: 'Username sudah digunakan'
                    });
                }
            }

            // Validasi email jika diubah
            if (email && email !== existingUser.email) {
                const userWithSameEmail = await userQueries.getUserByEmail(email);
                if (userWithSameEmail) {
                    return res.status(409).json({
                        success: false,
                        message: 'Email sudah digunakan'
                    });
                }
            }

            // Siapkan data update
            const updateData = {};
            if (username) updateData.username = username;
            if (email !== undefined) updateData.email = email; // Allow null
            
            // Hash password baru jika ada
            if (password) {
                updateData.password = await bcrypt.hash(password, 10);
            }

            // Update user
            const updatedUser = await userQueries.updateUser(id, updateData);

            res.status(200).json({
                success: true,
                message: 'User berhasil diupdate',
                data: {
                    id: updatedUser.id,
                    username: updatedUser.username,
                    email: updatedUser.email,
                    created_at: updatedUser.created_at
                }
            });
        } catch (error) {
            console.error('Error updating user:', error);
            res.status(500).json({
                success: false,
                message: 'Gagal mengupdate user',
                error: error.message
            });
        }
    },

    // DELETE /api/users/:id - Hapus user
    deleteUser: async (req, res) => {
        try {
            const { id } = req.params;

            // Cek apakah user ada
            const existingUser = await userQueries.getUserById(id);
            if (!existingUser) {
                return res.status(404).json({
                    success: false,
                    message: 'User tidak ditemukan'
                });
            }

            // Tidak bisa menghapus diri sendiri
            if (req.user && req.user.id === parseInt(id)) {
                return res.status(403).json({
                    success: false,
                    message: 'Tidak dapat menghapus akun sendiri'
                });
            }

            // Hapus user
            await userQueries.deleteUser(id);

            res.status(200).json({
                success: true,
                message: 'User berhasil dihapus'
            });
        } catch (error) {
            console.error('Error deleting user:', error);
            res.status(500).json({
                success: false,
                message: 'Gagal menghapus user',
                error: error.message
            });
        }
    }
};

module.exports = userController;