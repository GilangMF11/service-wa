# Perubahan Perilaku Login

## Masalah Sebelumnya
- Ketika mengakses `/auth/login` padahal sudah pernah login, user langsung di-redirect ke dashboard
- Tidak ada opsi untuk tetap mengakses halaman login
- Tidak ada cara untuk logout dan login dengan akun lain

## Solusi yang Diterapkan

### 1. **Menghapus Auto-Redirect**
- Frontend JavaScript tidak lagi otomatis redirect ke dashboard
- Controller tidak lagi redirect otomatis setelah login berhasil
- User tetap bisa mengakses halaman login meskipun sudah login

### 2. **Menambahkan Pesan Informasi**
- Jika user sudah login, muncul pesan info dengan opsi:
  - Link ke Dashboard
  - Link untuk Logout
- Jika login berhasil, muncul pesan sukses dengan opsi yang sama

### 3. **Fungsi Logout yang Lebih Baik**
- Menambahkan fungsi `logout()` di frontend
- Menghapus token dan user data dari localStorage
- Reload halaman untuk refresh state

## Perubahan Kode

### Frontend (`views/pages/auth/login.ejs`)
```javascript
// Sebelum: Auto redirect
if (token && token.length > 10) {
    window.location.replace('/dashboard');
}

// Sesudah: Tampilkan pesan dengan opsi
if (token && token.length > 10) {
    // Show message with options instead of auto redirect
    const messageDiv = document.createElement('div');
    messageDiv.className = 'alert alert-info already-logged-in-message';
    messageDiv.innerHTML = `
        Anda sudah login. 
        <a href="/dashboard" class="alert-link">Klik di sini untuk ke Dashboard</a> atau 
        <a href="#" onclick="logout()" class="alert-link">Logout</a> untuk login dengan akun lain.
    `;
}
```

### Controller (`controllers/authController.js`)
```javascript
// Sebelum: Auto redirect
} else {
    res.redirect('/dashboard');
}

// Sesudah: Return JSON response
} else {
    return res.json({
        success: true,
        message: 'Login berhasil',
        token: token,
        user: { ... }
    });
}
```

## Manfaat

1. **User Control** - User bisa memilih apakah ingin ke dashboard atau tetap di login page
2. **Multi-Account Support** - User bisa logout dan login dengan akun lain
3. **Better UX** - Tidak ada redirect yang tidak diinginkan
4. **Flexibility** - User bisa mengakses login page kapan saja

## Cara Menggunakan

1. **Jika sudah login dan mengakses `/auth/login`:**
   - Akan muncul pesan info dengan opsi ke Dashboard atau Logout
   - User bisa memilih sesuai kebutuhan

2. **Jika login berhasil:**
   - Akan muncul pesan sukses dengan opsi ke Dashboard atau Logout
   - User bisa memilih sesuai kebutuhan

3. **Untuk logout:**
   - Klik link "Logout" di pesan yang muncul
   - Atau panggil fungsi `logout()` di console

## Testing

1. Login dengan akun admin
2. Akses `/auth/login` - seharusnya tidak redirect otomatis
3. Cek apakah muncul pesan dengan opsi Dashboard/Logout
4. Test fungsi logout
5. Test login ulang dengan akun yang sama atau berbeda
