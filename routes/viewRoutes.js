const express = require('express');
const path = require('path');
const ejs = require('ejs');
const { requireAuth, preventAuthAccess } = require('../middleware/authMiddleware');

const router = express.Router();

// Import & pasang authRoutes
const authRoutes = require('./authRoutes');
router.use('/auth', authRoutes); // ← pakai router, bukan app

// Helper render dinamis tanpa pakai res.render()
const renderPage = (res, pageName, title = 'Untitled') => {
  const pagePath = path.join(__dirname, `../views/pages/${pageName}.ejs`);
  ejs.renderFile(pagePath, {}, (err, str) => {
    if (err) return res.status(500).send(`Error rendering ${pageName}`);

    const layoutPath = path.join(__dirname, '../views/layouts/main.ejs');
    ejs.renderFile(layoutPath, { title, body: str }, (err, html) => {
      if (err) return res.status(500).send(`Gagal render layout utama`);
      res.send(html);
    });
  });
};

// Routes
//router.get('/', (req, res) => renderPage(res, 'dashboard', 'Dashboard'));
// Route default - redirect ke login
router.get('/', (req, res) => {
  res.redirect('/auth/login');
});

// Protected routes - require authentication
router.get('/dashboard', requireAuth, (req, res) => renderPage(res, 'dashboard', 'Dashboard'));
router.get('/broadcast', requireAuth, (req, res) => renderPage(res, 'broadcast', 'Broadcast'));
router.get('/documentation', requireAuth, (req, res) => renderPage(res, 'documentation', 'Documentation'));
router.get('/sessions', requireAuth, (req, res) => renderPage(res, 'sessions', 'Session'));
router.get('/sessions/detail', requireAuth, (req, res) => renderPage(res, 'sessionsDetail', 'Session Detail'));
router.get('/users', requireAuth, (req, res) => renderPage(res, 'users', 'User'));
router.get('/chats', requireAuth, (req, res) => renderPage(res, 'chats', 'Chat'));
router.get('/chats/list', requireAuth, (req, res) => renderPage(res, 'chatsList', 'Chat List'));
router.get('/contact', requireAuth, (req, res) => renderPage(res, 'contact', 'Contact'));
router.get('/contact/list', requireAuth, (req, res) => renderPage(res, 'contactList', 'Contact List'));

// Fallback 404
router.use((req, res) => {
  const pagePath = path.join(__dirname, '../views/404.ejs');
  ejs.renderFile(pagePath, {}, (err, html) => {
    if (err) return res.status(500).send('404 page error');
    res.status(404).send(html);
  });
});


module.exports = router;
