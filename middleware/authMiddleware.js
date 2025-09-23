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

// Middleware untuk mengecek role admin
const requireAdmin = (req, res, next) => {
    console.log('🔍 requireAdmin middleware called for:', req.path);
    console.log('🔍 Request headers:', req.headers);
    console.log('🔍 Session:', req.session);
    
    // Cek token dari Authorization header (untuk API calls)
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
        try {
            // Verifikasi token JWT
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            
            console.log('🔍 JWT decoded:', decoded);
            
            // Cek role admin
            if (decoded.role !== 'admin') {
                console.log('❌ User is not admin, role:', decoded.role);
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Admin role required.'
                });
            }
            
            console.log('✅ User is admin, allowing access');
            // Tambahkan user info ke request
            req.user = decoded;
            return next();
        } catch (error) {
            console.error('❌ Token verification error:', error);
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
    }
    
    // Cek session untuk halaman web
    if (req.session && req.session.user) {
        console.log('🔍 Session user found:', req.session.user);
        if (req.session.user.role !== 'admin') {
            console.log('❌ Session user is not admin, role:', req.session.user.role);
            // Untuk halaman web, render halaman 403
            return res.status(403).render('pages/403');
        }
        console.log('✅ Session user is admin, allowing access');
        return next();
    }
    
    // Untuk halaman web, cek apakah ada token di query parameter (fallback)
    const tokenFromQuery = req.query.token;
    if (tokenFromQuery) {
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(tokenFromQuery, process.env.JWT_SECRET || 'your-secret-key');
            
            if (decoded.role === 'admin') {
                console.log('✅ Token from query is admin, allowing access');
                req.user = decoded;
                return next();
            }
        } catch (error) {
            console.error('❌ Token from query verification error:', error);
        }
    }
    
    console.log('❌ No token or session found');
    // Jika tidak ada token atau session
    if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized - Please login first'
        });
    } else {
        console.log('🔄 Redirecting to login page');
        return res.redirect('/auth/login');
    }
};

module.exports = {
    requireAuth,
    preventAuthAccess,
    verifyToken,
    requireAdmin
};
