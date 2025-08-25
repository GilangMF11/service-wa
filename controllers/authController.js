const jwt = require('jsonwebtoken');

exports.showLogin = (req, res) => {
    res.render('pages/auth/login'); // langsung render login.ejs tanpa layout
};

exports.handleLogin = (req, res) => {
    const { username, password } = req.body;
    
    // Validasi input
    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Username dan password diperlukan'
        });
    }
    
    // Validasi credentials (untuk demo, gunakan hardcoded)
    if (username === 'admin' && password === 'admin') {
        // Buat token JWT
        const token = jwt.sign(
            { 
                id: 1, 
                username: username,
                role: 'admin'
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );
        
        // Set session
        req.session.user = {
            id: 1,
            username: username,
            role: 'admin'
        };
        
        // Return response berdasarkan request type
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            // API call
                            return res.json({
                    success: true,
                    message: 'Login berhasil',
                    token: token,
                    user: {
                        id: 1,
                        username: username,
                        role: 'admin'
                    }
                });
        } else {
            // Web page
            res.redirect('/dashboard');
        }
            } else {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                // API call
                return res.status(401).json({
                    success: false,
                    message: 'Username atau password salah'
                });
            } else {
                // Web page
                res.status(401).send('Login gagal. Username atau password salah.');
            }
        }
};

exports.logOut = (req, res) => {
    // Destroy session
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
        });
    }
    
    // Return response berdasarkan request type
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        // API call
        return res.json({
            success: true,
            message: 'Logout berhasil'
        });
    } else {
        // Web page
        res.redirect('/auth/login');
    }
};

exports.showRegister = (req, res) => {
    res.render('pages/auth/register');
}
