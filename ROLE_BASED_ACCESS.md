# Role-Based Access Control (RBAC)

## Implementasi Pembatasan Akses Berdasarkan Role

### **🎯 Tujuan**
Membatasi akses ke halaman `/users` hanya untuk user dengan role `admin` saja.

### **🔧 Implementasi**

#### **1. Middleware `requireAdmin`**
```javascript
// middleware/authMiddleware.js
const requireAdmin = (req, res, next) => {
    // Cek token JWT
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Cek role admin
        if (decoded.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required.'
            });
        }
        
        req.user = decoded;
        return next();
    }
    
    // Cek session untuk halaman web
    if (req.session && req.session.user) {
        if (req.session.user.role !== 'admin') {
            return res.status(403).render('pages/403');
        }
        return next();
    }
    
    // Redirect ke login jika tidak ada token/session
    return res.redirect('/auth/login');
};
```

#### **2. Penerapan pada Routes**

**View Routes:**
```javascript
// routes/viewRoutes.js
const { requireAdmin } = require('../middleware/authMiddleware');

// Hanya admin yang bisa akses /users
router.get('/users', requireAdmin, (req, res) => renderPage(res, 'users', 'User'));
```

**API Routes:**
```javascript
// routes/api/userRoutes.js
const { requireAdmin } = require('../../middleware/authMiddleware');

// Semua routes users memerlukan role admin
router.use(requireAdmin);
```

#### **3. Frontend Validation**

**Sidebar Menu:**
```javascript
// views/partials/sidebar.ejs
<li class="nxl-item nxl-hasmenu" id="users-menu-item" style="display: none;">
    <a href="/users" class="nxl-link">
        <span class="nxl-micon"><i class="feather-users"></i></span>
        <span class="nxl-mtext">User</span>
    </a>
</li>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('token');
    const usersMenuItem = document.getElementById('users-menu-item');
    
    if (token && usersMenuItem) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        if (payload.role === 'admin') {
            usersMenuItem.style.display = 'block';
        } else {
            usersMenuItem.style.display = 'none';
        }
    }
});
</script>
```

#### **4. Halaman 403 Error**
```html
<!-- views/pages/403.ejs -->
<div class="error-container">
    <div class="error-icon">
        <i class="bi bi-shield-exclamation"></i>
    </div>
    
    <h1 class="error-title">Access Denied</h1>
    
    <p class="error-message">
        <strong>403 - Forbidden</strong><br>
        You don't have permission to access this page. This area is restricted to administrators only.
    </p>
    
    <div class="admin-badge">
        <i class="bi bi-person-check me-2"></i>
        Admin Access Required
    </div>
</div>
```

### **🛡️ Keamanan Multi-Layer**

#### **1. Backend Protection**
- **JWT Token Validation** - Verifikasi token dan role
- **Session Validation** - Cek session untuk halaman web
- **API Protection** - Semua API users memerlukan admin role

#### **2. Frontend Protection**
- **Menu Hiding** - Menu Users disembunyikan untuk non-admin
- **Token Decoding** - Decode JWT untuk cek role di frontend
- **Error Handling** - Redirect ke 403 jika akses ditolak

#### **3. User Experience**
- **Graceful Degradation** - Menu hilang tanpa error
- **Clear Error Messages** - Pesan error yang jelas
- **Easy Navigation** - Link ke dashboard dan logout

### **📋 Testing**

#### **Test Case 1: Admin User**
1. Login dengan role admin
2. Akses `/users` - ✅ Berhasil
3. Menu Users terlihat di sidebar
4. API `/api/users` - ✅ Berhasil

#### **Test Case 2: Non-Admin User**
1. Login dengan role user biasa
2. Akses `/users` - ❌ 403 Forbidden
3. Menu Users tidak terlihat di sidebar
4. API `/api/users` - ❌ 403 Forbidden

#### **Test Case 3: Unauthenticated User**
1. Tidak login
2. Akses `/users` - ❌ Redirect ke login
3. Menu Users tidak terlihat
4. API `/api/users` - ❌ 401 Unauthorized

### **🔐 Role Structure**

```javascript
// JWT Token Payload
{
    "id": 1,
    "username": "admin",
    "role": "admin",  // ← Key field for access control
    "iat": 1234567890,
    "exp": 1234567890
}
```

### **📝 Daftar Routes yang Dilindungi**

| Route | Method | Protection | Description |
|-------|--------|------------|-------------|
| `/users` | GET | `requireAdmin` | Halaman users (view) |
| `/api/users` | GET | `requireAdmin` | API get all users |
| `/api/users/:id` | GET | `requireAdmin` | API get user by ID |
| `/api/users` | POST | `requireAdmin` | API create user |
| `/api/users/:id` | PUT | `requireAdmin` | API update user |
| `/api/users/:id` | DELETE | `requireAdmin` | API delete user |

### **🚀 Cara Menambahkan Role Baru**

1. **Update JWT Token** - Tambahkan role di login
2. **Buat Middleware** - `requireRole('role_name')`
3. **Update Routes** - Terapkan middleware
4. **Update Frontend** - Cek role di JavaScript

### **⚠️ Catatan Penting**

1. **JWT Secret** - Pastikan `JWT_SECRET` aman di production
2. **Token Expiry** - Set expiry time yang wajar
3. **Role Validation** - Selalu validasi role di backend
4. **Frontend Security** - Frontend validation hanya untuk UX, bukan security
5. **Error Handling** - Handle error dengan graceful

### **🔧 Troubleshooting**

#### **Menu Users Tidak Muncul**
- Cek token di localStorage
- Cek role di JWT payload
- Cek console untuk error

#### **403 Error Meskipun Admin**
- Cek JWT secret consistency
- Cek token expiry
- Cek role field di token

#### **API 403 Error**
- Cek Authorization header
- Cek token format
- Cek middleware order
