// auth.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { userQueries } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'whatsapp-api-secret-key';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '24h';

// Middleware untuk memvalidasi token JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer TOKEN
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Token tidak ditemukan. Silakan login terlebih dahulu.'
        });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false, 
                message: 'Token tidak valid atau sudah kadaluarsa'
            });
        }
        
        req.user = user;
        next();
    });
};

// Fungsi untuk registrasi user baru
const registerUser = async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username dan password diperlukan'
            });
        }
        
        // Cek apakah username sudah digunakan
        const existingUser = await userQueries.getUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ 
                success: false, 
                message: 'Username sudah digunakan'
            });
        }
        
        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // Simpan user baru
        const newUser = await userQueries.createUser(username, hashedPassword, email);
        
        res.status(201).json({
            success: true,
            message: 'User berhasil didaftarkan',
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                createdAt: newUser.created_at
            }
        });
    } catch (error) {
        console.error('Error saat registrasi user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mendaftarkan user',
            error: error.message
        });
    }
};

// Fungsi untuk login user
const loginUser = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username dan password diperlukan'
            });
        }
        
        // Cek user di database
        const user = await userQueries.getUserByUsername(username);
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Username atau password salah'
            });
        }
        
        // Verifikasi password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Username atau password salah'
            });
        }
        
        // Buat token JWT
        const token = jwt.sign(
            { id: user.id, username: user.username }, 
            JWT_SECRET, 
            { expiresIn: JWT_EXPIRES }
        );
        
        res.status(200).json({
            success: true,
            message: 'Login berhasil',
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            },
            token: token
        });
    } catch (error) {
        console.error('Error saat login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal login',
            error: error.message
        });
    }
};

module.exports = {
    authenticateToken,
    registerUser,
    loginUser
};