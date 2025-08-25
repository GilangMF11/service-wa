// middleware/authMiddleware.js

// Middleware untuk mengecek apakah user sudah login
const requireAuth = (req, res, next) => {
    // Cek token dari Authorization header (untuk API calls)
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
        // Jika ada token, lanjutkan ke middleware berikutnya
        // Token validation akan dilakukan di middleware lain
        return next();
    }
    
    // Cek session untuk halaman web
    if (req.session && req.session.user) {
        return next();
    }
    
    // Untuk halaman web, render halaman login dengan script redirect
    if (req.xhr || req.path.startsWith('/api/')) {
        // Untuk API calls, return 401
        return res.status(401).json({
            success: false,
            message: 'Unauthorized - Please login first'
        });
    } else {
        // Untuk halaman web, render halaman yang memerlukan login
        // Middleware ini akan di-handle oleh frontend JavaScript
        return next();
    }
};

// Middleware untuk mencegah akses ke halaman login/register jika sudah login
const preventAuthAccess = (req, res, next) => {
    // Cek token dari localStorage (untuk API calls)
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
        // Jika ada token, redirect ke dashboard
        if (req.xhr || req.path.startsWith('/api/')) {
            return res.status(403).json({
                success: false,
                message: 'Already authenticated'
            });
        } else {
            return res.redirect('/dashboard');
        }
    }
    
    // Cek session untuk halaman web
    if (req.session && req.session.user) {
        // Jika sudah login, redirect ke dashboard
        return res.redirect('/dashboard');
    }
    
    // Jika belum login, lanjutkan ke halaman login/register
    next();
};

// Middleware untuk mengecek token JWT
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'No token provided'
        });
    }
    
    try {
        // Verifikasi token JWT
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        // Tambahkan user info ke request
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
};

module.exports = {
    requireAuth,
    preventAuthAccess,
    verifyToken
};
