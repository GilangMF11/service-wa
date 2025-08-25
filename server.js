// app.js
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Inisialisasi Express
const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Import & pasang authRoutes
const authRoutes = require('./routes/authRoutes');

app.use('/auth', authRoutes); // → /auth/login


// Inisialisasi WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Simpan status koneksi
let isClientReady = false;

// Event saat QR code tersedia untuk di-scan
client.on('qr', (qr) => {
    console.log('QR Code tersedia, silakan scan untuk login:');
    qrcode.generate(qr, { small: true });
});

// Event saat client siap
client.on('ready', () => {
    isClientReady = true;
    console.log('Client WhatsApp siap!');
});

// Inisialisasi WhatsApp client
client.initialize();

// Middleware untuk memeriksa status koneksi
const checkConnection = (req, res, next) => {
    if (!isClientReady) {
        return res.status(503).json({
            success: false,
            message: 'WhatsApp client belum siap. Silakan scan QR code terlebih dahulu.'
        });
    }
    next();
};

// Endpoint untuk mengirim pesan WhatsApp
app.post('/send-message', checkConnection, async (req, res) => {
    try {
        const { number, message } = req.body;

        if (!number || !message) {
            return res.status(400).json({
                success: false,
                message: 'Nomor telepon dan pesan harus disediakan'
            });
        }

        // Format nomor telepon
        let formattedNumber = number.replace(/\D/g, '');

        // Tambahkan @c.us di akhir nomor
        if (!formattedNumber.endsWith('@c.us')) {
            formattedNumber = `${formattedNumber}@c.us`;
        }

        // Kirim pesan dengan error handling yang robust
        let sendResult;
        let messageId = null;
        let timestamp = Date.now();

        try {
            sendResult = await client.sendMessage(formattedNumber, message);
            
            // Robust message ID extraction
            try {
                if (sendResult && sendResult.id) {
                    if (sendResult.id._serialized) {
                        messageId = sendResult.id._serialized;
                    } else if (sendResult.id.id) {
                        messageId = sendResult.id.id;
                    } else if (typeof sendResult.id === 'string') {
                        messageId = sendResult.id;
                    } else {
                        messageId = JSON.stringify(sendResult.id);
                    }
                }
                
                // Get timestamp from result if available
                if (sendResult && sendResult.timestamp) {
                    timestamp = sendResult.timestamp;
                }
            } catch (extractError) {
                console.warn('Failed to extract message ID:', extractError.message);
                messageId = 'unknown';
            }
        } catch (sendError) {
            // Check if it's a serialize error (message was sent but ID extraction failed)
            if (sendError.message && sendError.message.includes('serialize')) {
                console.warn('Message sent but failed to get confirmation ID (serialize error)');
                messageId = 'sent_no_id';
                // Message was actually sent, so we consider it successful
            } else {
                // Re-throw other errors
                throw sendError;
            }
        }

        res.status(200).json({
            success: true,
            message: messageId === 'sent_no_id' ? 'Pesan berhasil dikirim (tanpa ID konfirmasi)' : 'Pesan berhasil dikirim',
            data: {
                id: messageId,
                timestamp: timestamp
            }
        });
    } catch (error) {
        console.error('Error saat mengirim pesan:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengirim pesan',
            error: error.message
        });
    }
});

// Endpoint untuk memeriksa status koneksi
app.get('/status', (req, res) => {
    res.status(200).json({
        success: true,
        connected: isClientReady
    });
});

// Helper render dinamis
const renderPage = (res, pageName, title = 'Untitled') => {
    const pagePath = path.join(__dirname, `views/pages/${pageName}.ejs`);
    ejs.renderFile(pagePath, {}, (err, str) => {
        if (err) return res.status(500).send(`Error rendering ${pageName}`);
        res.render('layouts/main', {
            title,
            body: str,
        });
    });
};

// Routes
app.get('/', (req, res) => renderPage(res, 'dashboard', 'Dashboard'));
app.get('/dashboard', (req, res) => renderPage(res, 'dashboard', 'Dashboard'));
app.get('/user', (req, res) => renderPage(res, 'users', 'User'));


app.use((req, res) => {
    res.status(404).render('404');
});



// Jalankan server
app.listen(port, () => {
    console.log(`Server berjalan di port ${port}`);
});