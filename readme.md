# WhatsApp API dengan Multi-User Session & Broadcast System

🚀 **API lengkap untuk mengirim pesan WhatsApp dengan dukungan multi-user session dan sistem broadcast yang canggih menggunakan Express.js dan whatsapp-web.js.**

## 📋 Daftar Isi

- [Fitur Utama](#-fitur-utama)
- [Prasyarat](#-prasyarat)
- [Instalasi](#-instalasi)
- [Konfigurasi](#-konfigurasi)
- [Menjalankan Server](#-menjalankan-server)
- [Autentikasi & Multi-User](#-autentikasi--multi-user)
- [API Endpoints](#-api-endpoints)
  - [Manajemen Session](#manajemen-session)
  - [Pengiriman Pesan](#pengiriman-pesan)
  - [Sistem Broadcast](#sistem-broadcast)
- [Contoh Penggunaan](#-contoh-penggunaan)
- [Error Handling](#-error-handling)
- [Keamanan](#-keamanan)
- [Troubleshooting](#-troubleshooting)
- [Kontribusi](#-kontribusi)
- [Lisensi](#-lisensi)

## 🌟 Fitur Utama

### Core Features
- ✅ **Multi-User Session**: Dukungan multiple WhatsApp account sekaligus
- ✅ **QR Code Authentication**: Login mudah dengan scan QR code
- ✅ **Real-time Status**: Monitor status koneksi secara real-time
- ✅ **Message Sending**: Kirim pesan text ke nomor individual

### Advanced Broadcast System
- 📋 **Broadcast Lists Management**: Kelola daftar kontak broadcast
- 👥 **Contact Management**: Import/export kontak via CSV
- 📢 **Campaign Management**: Kelola kampanye broadcast dengan fitur lengkap
- 📅 **Scheduled Broadcasts**: Jadwalkan broadcast untuk waktu tertentu
- 📊 **Analytics & Reporting**: Laporan detail performa kampanye
- 📁 **Media Upload**: Upload dan kelola file media
- 📝 **Message Templates**: Sistem template pesan
- 🔄 **Real-time Processing**: Proses broadcast dengan kontrol pause/resume

## 🔧 Prasyarat

- **Node.js** (versi 14 atau lebih tinggi)
- **npm** atau **yarn**
- **Akun WhatsApp** aktif
- **Database** (sesuai konfigurasi)

## 📦 Instalasi

1. **Clone repository**
```bash
git clone <repository-url>
cd whatsapp-api
```

2. **Install dependencies**
```bash
npm install
# atau
yarn install
```

3. **Setup environment variables**
```bash
cp .env.example .env
```

## ⚙️ Konfigurasi

Edit file `.env` dengan konfigurasi yang sesuai:

```env
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=whatsapp_api
DB_USER=your_username
DB_PASS=your_password

# Session Configuration
SESSION_SECRET=your_session_secret

# Upload Configuration
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
```

## 🚀 Menjalankan Server

### Development Mode
```bash
npm run dev
# atau
yarn dev
```

### Production Mode
```bash
npm start
# atau
yarn start
```

Server akan berjalan di `http://localhost:3000`

## 🔐 Autentikasi & Multi-User

### Header Wajib
Untuk semua request (kecuali `/clients`), sertakan header:

```http
user-id: your-unique-user-id
Content-Type: application/json
```

### Multi-User Session
- Setiap user diidentifikasi dengan `user-id` unik
- Sesi WhatsApp disimpan terpisah di direktori `sessions/{user-id}`
- Mendukung multiple WhatsApp account secara bersamaan

## 📡 API Endpoints

### Base URL
```
http://localhost:3000/api/whatsapp
```

### Manajemen Session

#### Mendapatkan QR Code
```http
GET /:sessionId/qrcode
```

**Response:**
```json
{
  "success": true,
  "message": "QR Code siap untuk di-scan",
  "qrCode": "data:image/png;base64,..."
}
```

#### Memeriksa Status Koneksi
```http
GET /:sessionId/status
```

**Response:**
```json
{
  "success": true,
  "connected": true,
  "user": {
    "name": "Your Name",
    "number": "628123456789"
  }
}
```

#### Logout dan Hapus Sesi
```http
POST /:sessionId/logout
```

#### Daftar Client Aktif
```http
GET /clients
```

### Pengiriman Pesan

#### Kirim Pesan Text
```http
POST /:sessionId/send-message
```

**Body:**
```json
{
  "number": "628123456789",
  "message": "Halo, ini adalah pesan dari API!"
}
```

### Sistem Broadcast

#### 📋 Manajemen Broadcast Lists

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/:sessionId/broadcast/lists` | Get semua broadcast lists |
| POST | `/:sessionId/broadcast/lists` | Buat broadcast list baru |
| GET | `/:sessionId/broadcast/lists/:listId` | Detail broadcast list |
| PUT | `/:sessionId/broadcast/lists/:listId` | Update broadcast list |
| DELETE | `/:sessionId/broadcast/lists/:listId` | Hapus broadcast list |

#### 👥 Manajemen Kontak

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/:sessionId/broadcast/lists/:listId/contacts` | Get kontak dengan pagination |
| POST | `/:sessionId/broadcast/lists/:listId/contacts` | Tambah kontak manual |
| POST | `/:sessionId/broadcast/lists/:listId/contacts/bulk` | Import kontak dari CSV |
| PUT | `/:sessionId/broadcast/lists/:listId/contacts/:number` | Update kontak |
| DELETE | `/:sessionId/broadcast/lists/:listId/contacts/:number` | Hapus satu kontak |

#### 📢 Manajemen Kampanye

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/:sessionId/broadcast/campaigns` | Get semua kampanye |
| POST | `/:sessionId/broadcast/send` | Kirim broadcast sekarang |
| POST | `/:sessionId/broadcast/schedule` | Jadwalkan broadcast |
| GET | `/:sessionId/broadcast/campaigns/:campaignId` | Detail & statistik kampanye |
| POST | `/:sessionId/broadcast/campaigns/:campaignId/pause` | Pause kampanye |
| POST | `/:sessionId/broadcast/campaigns/:campaignId/resume` | Resume kampanye |
| POST | `/:sessionId/broadcast/campaigns/:campaignId/stop` | Stop kampanye |

#### 📁 Media & File Management

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/:sessionId/broadcast/upload` | Upload file media |
| DELETE | `/:sessionId/broadcast/upload/:filename` | Hapus file |

#### 📊 Analytics & Reporting

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/:sessionId/broadcast/stats` | Statistik overview |
| GET | `/:sessionId/broadcast/export/contacts/:listId` | Export kontak ke CSV |
| GET | `/:sessionId/broadcast/export/campaign/:campaignId` | Export laporan kampanye |

## 💡 Contoh Penggunaan

### 1. Setup Session Baru

```javascript
// 1. Dapatkan QR Code
const qrResponse = await fetch('/api/whatsapp/user123/qrcode', {
  headers: { 'user-id': 'user123' }
});

// 2. Scan QR Code dengan WhatsApp

// 3. Cek status koneksi
const statusResponse = await fetch('/api/whatsapp/user123/status', {
  headers: { 'user-id': 'user123' }
});
```

### 2. Kirim Pesan Sederhana

```javascript
const response = await fetch('/api/whatsapp/user123/send-message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'user-id': 'user123'
  },
  body: JSON.stringify({
    number: '628123456789',
    message: 'Halo dari WhatsApp API!'
  })
});
```

### 3. Broadcast Workflow

```javascript
// 1. Buat broadcast list
const listResponse = await fetch('/api/whatsapp/user123/broadcast/lists', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'user-id': 'user123'
  },
  body: JSON.stringify({
    name: 'Customer List',
    description: 'Daftar pelanggan aktif'
  })
});

const listId = listResponse.data.id;

// 2. Upload kontak via CSV
const formData = new FormData();
formData.append('file', csvFile);

await fetch(`/api/whatsapp/user123/broadcast/lists/${listId}/contacts/bulk`, {
  method: 'POST',
  headers: { 'user-id': 'user123' },
  body: formData
});

// 3. Kirim broadcast
await fetch('/api/whatsapp/user123/broadcast/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'user-id': 'user123'
  },
  body: JSON.stringify({
    listId: listId,
    message: 'Selamat! Anda mendapat promo spesial!',
    delayBetweenMessages: 2000
  })
});
```

### 4. Format CSV untuk Import Kontak

```csv
name,number,email,custom_field1
John Doe,628123456789,john@example.com,VIP
Jane Smith,628987654321,jane@example.com,Regular
```

## ⚠️ Error Handling

### Format Response Error
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "validation details"
  }
}
```

### Common Error Codes
- `SESSION_NOT_FOUND`: Session tidak ditemukan
- `NOT_CONNECTED`: WhatsApp tidak terhubung
- `INVALID_NUMBER`: Format nomor tidak valid
- `RATE_LIMITED`: Terlalu banyak request
- `FILE_TOO_LARGE`: File terlalu besar
- `BROADCAST_IN_PROGRESS`: Broadcast sedang berjalan

## 🔒 Keamanan

### Rate Limiting
- **General API**: 100 requests per 15 menit
- **Broadcast**: 10 campaigns per jam
- **Upload**: 5 files per menit

### Validasi File Upload
- **Allowed Types**: jpg, jpeg, png, gif, pdf, doc, docx
- **Max Size**: 10MB per file
- **Virus Scanning**: Otomatis untuk file upload

### Security Headers
```javascript
// Pastikan menggunakan HTTPS di production
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
}));
```

## 🚨 Troubleshooting

### Session Tidak Terhubung
1. Hapus folder session: `rm -rf sessions/{user-id}`
2. Restart server
3. Scan QR code ulang

### QR Code Tidak Muncul
- Pastikan WhatsApp Web tidak login di browser lain
- Cek log server untuk error
- Pastikan port tidak diblokir firewall

### Broadcast Lambat
- Sesuaikan `delayBetweenMessages` (minimal 1000ms)
- Monitor penggunaan CPU dan memory
- Gunakan database yang dioptimasi

### File Upload Gagal
- Cek disk space tersedia
- Pastikan folder `uploads` memiliki permission write
- Validasi format dan ukuran file

## 🔧 Dependencies

```json
{
  "express": "^4.18.0",
  "whatsapp-web.js": "^1.21.0",
  "multer": "^1.4.5",
  "csv-parser": "^3.0.0",
  "helmet": "^6.0.0",
  "cors": "^2.8.5",
  "dotenv": "^16.0.0",
  "node-cron": "^3.0.0"
}
```

## 📈 Performance Tips

1. **Database Optimization**
   - Gunakan indexing untuk query yang sering digunakan
   - Implement connection pooling

2. **Memory Management**
   - Monitor penggunaan memory untuk session yang banyak
   - Implement session cleanup otomatis

3. **File Management**
   - Setup automatic cleanup untuk file lama
   - Gunakan CDN untuk file static

## 🤝 Kontribusi

1. Fork repository ini
2. Buat branch feature (`git checkout -b feature/amazing-feature`)
3. Commit perubahan (`git commit -m 'Add amazing feature'`)
4. Push ke branch (`git push origin feature/amazing-feature`)
5. Buat Pull Request

## 📝 Changelog

### v2.0.0 (Latest)
- ✅ Complete broadcast system
- ✅ Multi-user session support
- ✅ Advanced analytics
- ✅ File upload management
- ✅ Scheduled broadcasts

### v1.0.0
- ✅ Basic WhatsApp integration
- ✅ Simple message sending
- ✅ QR code authentication

## 📄 Lisensi

MIT License - lihat file [LICENSE](LICENSE) untuk detail.

## 📞 Support

- **Email**: gmf@blockchaindev.com
- **Documentation**: [docs.yourapi.com](https://docs.yourapi.com)
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)

---

<div align="center">

**⭐ Jika project ini membantu, berikan star di GitHub! ⭐**

Made with ❤️ by GilangMF11

</div>