exports.showLogin = (req, res) => {
    res.render('pages/auth/login'); // langsung render login.ejs tanpa layout
};

exports.handleLogin = (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin@example.com' && password === 'admin') {
      res.redirect('/dashboard');
    } else {
      res.status(401).send('Login gagal. Email atau password salah.');
    }
};

exports.logOut = (req, res) => {
  if (req.session) {
      req.session.destroy((err) => {
          if (err) {
              console.error('Error destroying session:', err);
          }
          res.redirect('/auth/login');
      });
  } else {
      // If there's no session, just redirect to login
      res.redirect('/auth/login');
  }
};

exports.showRegister = (req, res) => {
    res.render('pages/auth/register');
}
