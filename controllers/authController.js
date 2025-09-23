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
    let userRole = 'user'; // Default role
    let userId = 2;
    
    if (username === 'admin' && password === 'admin') {
        userRole = 'admin';
        userId = 1;
    } else if (username === 'user' && password === 'user') {
        userRole = 'user';
        userId = 2;
    } else {
        // Invalid credentials
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(401).json({
                success: false,
                message: 'Username atau password salah'
            });
        } else {
            return res.status(401).send('Login gagal. Username atau password salah.');
        }
    }
    
    // Buat token JWT
    const token = jwt.sign(
        { 
            id: userId, 
            username: username,
            role: userRole
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
    );
    
    // Set session
    req.session.user = {
        id: userId,
        username: username,
        role: userRole
    };
    
    console.log('🔍 Login successful:', { username, role: userRole, userId });
    
    // Prepare response data
    const responseData = {
        success: true,
        message: 'Login berhasil',
        token: token,
        user: {
            id: userId,
            username: username,
            role: (req.session && req.session.user && req.session.user.role) ? req.session.user.role : userRole
        }
    };
    
    console.log('🔍 API Response Data:', JSON.stringify(responseData, null, 2));
    
    // Return response berdasarkan request type
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        // API call
        console.log('📤 Sending JSON response for API call');
        return res.json(responseData);
    } else {
        // Web page - don't auto redirect, let frontend handle it
        console.log('📤 Sending JSON response for web page');
        return res.json(responseData);
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
};

// Test endpoint untuk melihat response API
exports.testLogin = (req, res) => {
    const { username, password } = req.body;
    
    console.log('🧪 Test login called with:', { username, password });
    
    // Simulate login logic
    let userRole = 'user';
    let userId = 2;
    
    if (username === 'admin' && password === 'admin') {
        userRole = 'admin';
        userId = 1;
    } else if (username === 'user' && password === 'user') {
        userRole = 'user';
        userId = 2;
    } else {
        return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
        });
    }
    
    const responseData = {
        success: true,
        message: 'Test login successful',
        token: 'test-token-' + Date.now(),
        user: {
            id: userId,
            username: username,
            role: userRole
        },
        debug: {
            timestamp: new Date().toISOString(),
            userRole: userRole,
            userId: userId
        }
    };
    
    console.log('🧪 Test API Response:', JSON.stringify(responseData, null, 2));
    
    res.json(responseData);
};
