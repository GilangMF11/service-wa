# Panduan Migrasi Session WhatsApp

## Masalah: QR Code Tidak Muncul Setelah Pindah Komputer

### Penyebab Masalah
1. **Session data tersimpan di memory** - QR code dan status koneksi hanya tersimpan di variabel `clients` di memory
2. **Session files spesifik komputer** - Folder `sessions/` berisi data browser yang spesifik untuk setiap komputer
3. **Database hanya menyimpan metadata** - Tidak menyimpan QR code atau status koneksi real-time

### Solusi yang Tersedia

#### 1. **Solusi Cepat: Reset Session**
```bash
# Hapus semua session dan buat ulang
npm run cleanup-sessions

# Restart server
npm start
```

#### 2. **Solusi Lengkap: Migrasi Session**
```bash
# Di komputer lama (sebelum pindah)
npm run migrate-sessions

# Push ke GitLab
git add .
git commit -m "Add session migration support"
git push origin main

# Di komputer baru (setelah pull)
npm run restore-sessions
npm start
```

#### 3. **Solusi Manual: Hapus Session Tertentu**
```bash
# Hapus session tertentu dari database
psql -h localhost -U postgres -d whatsapp_api -c "DELETE FROM whatsapp_sessions WHERE session_id = 'your-session-id';"

# Hapus folder session
rm -rf sessions/session-your-session-id-*

# Restart server
npm start
```

### Fitur Baru yang Ditambahkan

#### 1. **Persistence QR Code ke Database**
- QR code sekarang disimpan ke database saat dihasilkan
- Status koneksi juga disimpan ke database
- QR code dapat dimuat dari database saat server restart

#### 2. **Script Migrasi Session**
- `cleanup-sessions.js` - Membersihkan semua session
- `migrate-sessions.js` - Memigrasi session antar komputer

#### 3. **Auto-recovery QR Code**
- Server akan otomatis memuat QR code dari database jika tidak ada di memory
- Mendukung pemindahan session antar komputer

### Cara Menggunakan

#### Untuk Pindah Komputer:
1. **Di komputer lama:**
   ```bash
   npm run migrate-sessions
   git add .
   git commit -m "Backup sessions"
   git push origin main
   ```

2. **Di komputer baru:**
   ```bash
   git pull origin main
   npm install
   npm run restore-sessions
   npm start
   ```

#### Untuk Reset Session:
```bash
npm run cleanup-sessions
npm start
```

### Troubleshooting

#### QR Code Masih Tidak Muncul:
1. Cek log server untuk error
2. Pastikan database terhubung
3. Coba hapus session dan buat ulang
4. Cek apakah ada error di console browser

#### Session Tidak Ter-restore:
1. Pastikan script migrate-sessions berhasil dijalankan
2. Cek apakah ada data di database
3. Pastikan folder sessions kosong sebelum restore

#### Error Database:
1. Pastikan koneksi database benar
2. Cek environment variables
3. Pastikan tabel whatsapp_sessions ada

### Catatan Penting

1. **Session WhatsApp bersifat temporary** - QR code akan expired setelah beberapa menit
2. **Setiap komputer perlu scan ulang** - WhatsApp tidak mendukung transfer session langsung
3. **Backup session files** - Gunakan script migrasi untuk backup/restore
4. **Database persistence** - QR code sekarang tersimpan di database untuk recovery

### Struktur Database Baru

Tabel `whatsapp_sessions` sekarang menyimpan:
- `session_data` (JSONB) - Berisi QR code, status koneksi, phone number
- `is_active` - Status apakah session aktif
- `created_at`, `updated_at` - Timestamp

### Monitoring

Untuk memonitor status session:
```bash
# Cek session di database
psql -h localhost -U postgres -d whatsapp_api -c "SELECT session_id, is_active, session_data->>'isConnected' as connected FROM whatsapp_sessions;"

# Cek log server
tail -f logs/app.log
```
