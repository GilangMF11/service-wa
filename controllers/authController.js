const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { userQueries } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'whatsapp-api-secret-key';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '24h';

exports.showLogin = (req, res) => {
    res.render('pages/auth/login');
};

exports.handleLogin = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // 1. Validasi input
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username dan password diperlukan'
            });
        }
        
        // 2. Cari user di database
        const user = await userQueries.getUserByUsername(username);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Username atau password salah'
            });
        }
        
        // 3. Verifikasi password dengan bcrypt
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Username atau password salah'
            });
        }
        
        // 4. Buat token JWT
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username,
                role: user.role
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );
        
        // 5. Set session (untuk server-side rendering support)
        if (req.session) {
            req.session.user = {
                id: user.id,
                username: user.username,
                role: user.role
            };
        }
        
        console.log('✅ Login successful:', { username: user.username, role: user.role, userId: user.id });
        
        // 6. Return response
        const responseData = {
            success: true,
            message: 'Login berhasil',
            token: token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                email: user.email
            }
        };
        
        res.json(responseData);
        
    } catch (error) {
        console.error('❌ Error in handleLogin:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan sistem saat login',
            error: error.message
        });
    }
};

exports.logOut = (req, res) => {
    if (req.session) {
        req.session.destroy((err) => {
            if (err) console.error('Error destroying session:', err);
        });
    }
    
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Logout berhasil' });
    } else {
        res.redirect('/auth/login');
    }
};

exports.showRegister = (req, res) => {
    res.render('pages/auth/register');
};

exports.testLogin = (req, res) => {
    res.status(200).json({ 
        success: true, 
        message: 'Endpoint test login siap',
        note: 'Gunakan /auth/login untuk login yang sesungguhnya' 
    });
};
