# WhatsApp API dengan Multi-User Session

API untuk mengirim pesan WhatsApp dengan dukungan multi-user session menggunakan Express.js dan whatsapp-web.js.

## Prasyarat

- Node.js (versi 14 atau lebih tinggi)
- npm atau yarn
- Akun WhatsApp aktif

## Instalasi

1. Clone repository ini atau download kode sumber
2. Instal dependensi dengan menjalankan:

```bash
npm install
```

Atau menggunakan yarn:

```bash
yarn install
```

## Menjalankan Server

```bash
npm start
```

Atau menggunakan yarn:

```bash
yarn start
```

Untuk development dengan auto-restart:

```bash
npm run dev
```

## Fitur Multi-User Session

API ini mendukung beberapa user WhatsApp sekaligus. Setiap user diidentifikasi dengan `user-id` yang dikirim dalam header request. Sesi WhatsApp untuk masing-masing user disimpan secara terpisah di direktori `sessions`.

## Penggunaan API

### Header Wajib

Untuk semua request (kecuali untuk endpoint `/clients`), Anda harus menyertakan header berikut:

```
user-id: [id-pengguna]
```

### Mendapatkan QR Code

```
GET /qrcode
```

Respons:
```json
{
  "success": true,
  "message": "QR Code siap untuk di-scan",
  "qrCode": "data-qr-code"
}
```

### Memeriksa Status Koneksi

```
GET /status
```

Respons:
```json
{
  "success": true,
  "connected": true
}
```

### Mengirim Pesan

```
POST /send-message
```

Body Request:
```json
{
  "number": "628123456789",
  "message": "Halo, ini adalah pesan dari API!"
}
```

Respons sukses:
```json
{
  "success": true,
  "message": "Pesan berhasil dikirim",
  "data": {
    "id": "message-id",
    "timestamp": 1620000000
  }
}
```

### Logout dan Hapus Sesi

```
POST /logout
```

Respons:
```json
{
  "success": true,
  "message": "Berhasil logout dan sesi dihapus"
}
```

### Mendapatkan Daftar Client

```
GET /clients
```

Respons:
```json
{
  "success": true,
  "clients": [
    {
      "userId": "user1",
      "isReady": true
    },
    {
      "userId": "user2",
      "isReady": false
    }
  ]
}
```

## Catatan Penting

- Nomor telepon harus berformat internasional tanpa tanda + (contoh: 628123456789 untuk Indonesia)
- Server harus tetap berjalan agar dapat mengirim pesan
- Setiap sesi disimpan secara terpisah berdasarkan `user-id`
- Jika client belum terhubung, API akan mengembalikan pesan error dengan status 503 dan informasi bahwa QR code perlu di-scan

🎯 COMPLETE BROADCAST ROUTES SYSTEM

📋 === BROADCAST LISTS MANAGEMENT ===
✅ GET    /:sessionId/broadcast/lists                          # Get all lists with pagination & search
✅ POST   /:sessionId/broadcast/lists                          # Create new broadcast list
✅ GET    /:sessionId/broadcast/lists/:listId                  # Get specific list details
✅ PUT    /:sessionId/broadcast/lists/:listId                  # Update list info
✅ DELETE /:sessionId/broadcast/lists/:listId                  # Delete broadcast list

👥 === BROADCAST CONTACTS MANAGEMENT ===
✅ GET    /:sessionId/broadcast/lists/:listId/contacts         # Get contacts with pagination & search
✅ POST   /:sessionId/broadcast/lists/:listId/contacts         # Add contacts manually
✅ POST   /:sessionId/broadcast/lists/:listId/contacts/bulk    # Bulk import from CSV
✅ PUT    /:sessionId/broadcast/lists/:listId/contacts/:number # Update specific contact
✅ DELETE /:sessionId/broadcast/lists/:listId/contacts/:number # Remove single contact
✅ DELETE /:sessionId/broadcast/lists/:listId/contacts         # Remove multiple contacts

📢 === BROADCAST CAMPAIGNS MANAGEMENT ===
✅ GET    /:sessionId/broadcast/campaigns                      # Get all campaigns with filtering
✅ POST   /:sessionId/broadcast/send                           # Send broadcast immediately
✅ POST   /:sessionId/broadcast/schedule                       # Schedule broadcast for later
✅ GET    /:sessionId/broadcast/campaigns/:campaignId          # Get campaign details & stats
✅ POST   /:sessionId/broadcast/campaigns/:campaignId/pause    # Pause running campaign
✅ POST   /:sessionId/broadcast/campaigns/:campaignId/resume   # Resume paused campaign
✅ POST   /:sessionId/broadcast/campaigns/:campaignId/stop     # Stop campaign completely
✅ DELETE /:sessionId/broadcast/campaigns/:campaignId          # Delete campaign

📁 === MEDIA & FILE MANAGEMENT ===
✅ POST   /:sessionId/broadcast/upload                         # Upload media files
✅ DELETE /:sessionId/broadcast/upload/:filename               # Delete uploaded file

📊 === ANALYTICS & REPORTING ===
✅ GET    /:sessionId/broadcast/stats                          # Overview statistics
✅ GET    /:sessionId/broadcast/export/contacts/:listId        # Export contacts to CSV
✅ GET    /:sessionId/broadcast/export/campaign/:campaignId    # Export campaign report

📝 === TEMPLATES & UTILITIES ===
✅ GET    /:sessionId/broadcast/templates                      # Get message templates
✅ POST   /:sessionId/broadcast/templates                      # Create custom template

🛡️ === SECURITY & MIDDLEWARE ===
✅ Session validation for all routes
✅ Rate limiting for broadcast operations
✅ File upload validation & security
✅ Contact data format validation
✅ Message content validation
✅ Campaign ownership verification
✅ Comprehensive error handling

📦 === REQUIRED DEPENDENCIES ===
✅ multer              # File upload handling
✅ csv-parser          # CSV file processing
✅ fs & path           # File system operations

🎯 === KEY FEATURES IMPLEMENTED ===

🔄 Real-time Operations:
✅ Background broadcast processing
✅ Pause/Resume functionality
✅ Progress tracking
✅ Status updates

📈 Analytics & Monitoring:
✅ Campaign performance metrics
✅ Success/failure rates
✅ Contact engagement tracking
✅ Export capabilities

🔒 Security Features:
✅ Multi-layer validation
✅ Rate limiting
✅ File type restrictions
✅ Access control
✅ Error sanitization

📱 User Experience:
✅ Bulk operations support
✅ CSV import/export
✅ Template system
✅ Scheduled broadcasts
✅ Comprehensive error messages

🚀 === ADVANCED FEATURES ===

📅 Scheduling System:
✅ Schedule broadcasts for future
✅ Automatic execution
✅ Timezone handling

📊 Performance Optimization:
✅ Pagination for large datasets
✅ Search functionality
✅ Efficient database queries
✅ Background processing

🔧 Maintenance Features:
✅ Cleanup old campaigns
✅ File management
✅ Status monitoring
✅ Error tracking

💡 === USAGE EXAMPLES ===

📋 Create List & Add Contacts:
POST /api/whatsapp/session123/broadcast/lists
POST /api/whatsapp/session123/broadcast/lists/1/contacts/bulk (CSV)

📢 Send Broadcast:
POST /api/whatsapp/session123/broadcast/send
GET  /api/whatsapp/session123/broadcast/campaigns/1 (track progress)

📊 Analytics:
GET /api/whatsapp/session123/broadcast/stats
GET /api/whatsapp/session123/broadcast/export/campaign/1

🎯 === ERROR HANDLING ===
✅ Multer upload errors
✅ Database constraint violations
✅ Validation errors
✅ Network errors
✅ File system errors
✅ Authentication errors
✅ Rate limit errors

This is a COMPLETE, PRODUCTION-READY broadcast system with:
- 25+ endpoints covering all broadcast operations
- Advanced security and validation
- Real-time processing capabilities
- Comprehensive analytics
- File management system
- Template system
- Export/import functionality
- Scheduling capabilities
- Performance optimization
- Error handling & monitoring