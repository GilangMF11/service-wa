# Product Requirements Document (PRD)
**Fitur:** API Key Integration & Random Limiter Delay (Fonnte-style)
**Status:** Draft / Proposed
**Target Module:** Backend API, Database, Dashboard UI

---

## 1. Latar Belakang & Tujuan
Saat ini, untuk menggunakan layanan WhatsApp (kirim pesan, broadcast, dll), *client* harus melakukan login melalui kredensial akun untuk mendapatkan token JWT dari dashboard. 

**Tujuan Pengembangan:**
Memungkinkan pengguna (bisa berupa aplikasi eksternal, server pihak ketiga, ERP, dll) untuk mengkonsumsi API WhatsApp service ini secara langsung tanpa harus melakukan *session login* berbasis browser, melainkan hanya menggunakan **API Key** yang valid. Proses kerjanya dibuat identik seperti layanan API Fonnte/Wablas, termasuk melengkapi fitur pengiriman dengan *delay* acak (Random Limiter) untuk meminimalisir risiko blokir dari pihak WhatsApp (Anti-Ban).

---

## 2. Fitur Utama (Key Features)

### A. API Key Management (Dashboard)
1. **Generate API Key:** Pengguna dapat membuat API Key unik secara mandiri lewat dashboard.
2. **Revoke/Regenerate:** Fitur untuk menghapus atau membuat ulang API Key jika terjadi kebocoran (compromise).
3. **Visibility:** API Key disensor (mirip `sk-live-...xxxx`), user dapat melihat (copy) API Key menggunakan tombol khusus.
4. **Log Penggunaan:** (Opsional) Rekam kapan terakhir kali API Key tersebut digunakan.

### B. Otentikasi API Terpusat (Header Auth)
1. Endpoints `POST /api/whatsapp/send-message` dan `POST /api/whatsapp/broadcast` dapat diakses tidak hanya menggunakan otentikasi JWT reguler, tetapi juga diverifikasi via `Authorization` Header khusus API.
2. **Contoh Request:**
   ```http
   POST /api/whatsapp/send-message
   Authorization: <API_KEY_ANDA>
   Content-Type: application/json
   
   {
      "sessionId": "b3f0-....",
      "target": "08123xxxx",
      "message": "Halo, ini pesan via API Key!"
   }
   ```

### C. Smart Broadcast & Random Limiter (Anti-Ban Engine)
Saat menerima *request broadcast* masal melalui API, backend tidak boleh mengirim semua pesan secara instan (akan dikenali sebagai spam oleh WhatsApp).
1. **Sleep / Delay Engine:** Sistem akan memberikan waktu tunggu *(delay)* antar pesan untuk simulasi pengetikan manusia.
2. **Random Limiter:** User dapat menentukan jarak kirim, misal: *Delay acak antara 5 hingga 15 detik*.
3. **Background Job Queue:** Karena durasi request HTTP tidak bisa selamanya terbuka, request broadcast melalui API Key akan langsung me-return responses `200 OK (Queued)`, sementara server mengeksekusi pengiriman di *background* menggunakan sistem antrian (Memory Array / Redis).

---

## 3. Spesifikasi Teknis & Kebutuhan (Technical Requirements)

### 3.1. Perubahan Skema Database (Database Schema)
Untuk mengelola API Key, kita memiliki 2 opsi. Opsi terbaik adalah membuat tabel baru `user_api_keys` agar satu *user* bisa memiliki beberapa environment (Development, Production).

**Tabel `api_keys`:**
- `id` (PK, UUID)
- `user_id` (FK ke req.user.id)
- `api_key` (String unik panjang yang *di-generate*, e.g., kriptografi aman `crypto.randomBytes()`)
- `description` (Label: misal "Key untuk Toko Online", "Key ERP")
- `is_active` (Boolean, Default: True)
- `last_used_at` (Timestamp, kapan terakhir dipakai)
- `created_at` (Timestamp)

### 3.2. Penyesuaian Middleware (`middleware/authMiddleware.js`)
Menambahkan `apiKeyAuthMiddleware` untuk mencegat token.
1. Cek apakah ada token bertipe standard `JWT`.
2. Jika tidak ada, cek apakah token yang dikirim valid berdasar `Select * From api_keys Where api_key = ?`.
3. Jika valid, *inject* `req.user` dari pemilik *API Key* tersebut. Lanjut `next()`.

### 3.3. Penyesuaian Kontroler Pengiriman (`broadcastController.js`)
Menambahkan logika perombakan queue (Antrian) untuk menahan delay.
```javascript
// Contoh Logika Broadcast Asynchronous dengan Delay
const minDelay = req.body.minDelay || 3000; // 3 detik
const maxDelay = req.body.maxDelay || 8000; // 8 detik

// Return response lebih dulu (Fonnte style)
res.status(200).json({ status: true, message: "Pesan masuk antrian (Queued)" });

// Jalankan background asinkron
(async () => {
   for (let target of targetList) {
       await sendMessageToClient(target, message);
       // Random delay kalkulator
       const sleepTime = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
       await new Promise(resolve => setTimeout(resolve, sleepTime));
   }
})();
```

---

## 4. UI / UX Flow (Antarmuka)
1. **Menu Baru di Sidebar:** Menu `API Keys` / `Developer` di pojok kiri.
2. **Halaman `/api-keys`:**
   - Menampilkan tabel list API Key yang dimiliki.
   - Tombol "+ Generate New Key" yang memmunculkan modal.
   - Tombol "Revoke" untuk menonaktifkan Key lama.
3. **Halaman Dokumentasi (Postman siap pakai):** Formatted panduan cara panggil cURL/Fetch di Dashboard sehingga user langsung paham format JSON Request-nya.

---

## 5. Pertanyaan & Konfirmasi (User Review Required)

> [!IMPORTANT]
> **Keputusan Sistem Antrian (Queue Engine):**
> Jika jumlah pesannya sampai puluhan ribu (misal dikirim lewat API dari aplikasi pihak ketiga), apakah kita perlu menggunakan *Library Antrian Kelas Berat* seperti **BullMQ + Redis**? Ataukah kita akan menggunakan antrian memori (array Node.js) dasar terlebih dahulu untuk MVP? *(Antrian memori mudah ludes jika server mati / restart saat proses kirim berlangung).*

> [!WARNING]
> **Hit/Rate Limits per Key:**
> Fonnte biasanya memberikan batasan *Quota* per bulan per API Key. Karena ini project self-hosted, apakah Anda butuh fitur Kuota / Pembatasan *Rate Limiting* (misal max 100 hit / menit) atau dibebaskan *(Unlimited)*?

**Langkah Selanjutnya:**
Jika Anda menyetujui cetak biru spesifikasi sistem ini, mari saya mulai implementasinya. Saya rasa langkah pertama yang pas adalah merancang **Tabel Database** dan menyesuaikan **AuthMiddleware**. Bagaimana pendapat Anda?
