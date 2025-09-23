# API Response Testing Guide

## **🧪 Test API Response**

### **Akses Test Page**
- URL: `http://localhost:3000/test-api`
- Halaman khusus untuk testing API response
- Tidak memerlukan authentication

### **Test Endpoints**

#### **1. Test Login API (Real)**
- **URL:** `POST /auth/login`
- **Purpose:** Test actual login API
- **Response:** Real JWT token dan user data

#### **2. Test Login API (Mock)**
- **URL:** `POST /auth/test-login`
- **Purpose:** Test login logic tanpa JWT
- **Response:** Mock token dan user data

## **🔍 Expected API Response Format**

### **Success Response**
```json
{
  "success": true,
  "message": "Login berhasil",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

### **Error Response**
```json
{
  "success": false,
  "message": "Username atau password salah"
}
```

## **🧪 Test Cases**

### **1. Admin Login Test**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Login berhasil",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

### **2. User Login Test**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"user"}'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Login berhasil",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 2,
    "username": "user",
    "role": "user"
  }
}
```

### **3. Invalid Login Test**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"invalid","password":"invalid"}'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Username atau password salah"
}
```

## **🔧 Debug Console Logs**

### **Server Side Logs**
```
🔍 Login successful: { username: 'admin', role: 'admin', userId: 1 }
🔍 API Response Data: {
  "success": true,
  "message": "Login berhasil",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
📤 Sending JSON response for web page
```

### **Client Side Logs**
```
🔍 Login response: {success: true, user: {role: "admin"}}
🔍 User role from API: admin
🔍 Token stored: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
🔍 User data stored: {id: 1, username: "admin", role: "admin"}
```

## **✅ Validation Checklist**

- [ ] API returns `success: true` for valid credentials
- [ ] API returns `success: false` for invalid credentials
- [ ] User object contains `id`, `username`, and `role`
- [ ] Role is correctly set based on username/password
- [ ] Token is included in response
- [ ] Response format is consistent
- [ ] Console logs show correct data flow

## **🐛 Troubleshooting**

### **Role Not Returned**
1. Check server console logs
2. Verify username/password matching
3. Check response data structure
4. Verify JSON parsing

### **Invalid Response Format**
1. Check Content-Type headers
2. Verify JSON.stringify usage
3. Check response status codes
4. Verify error handling

### **Token Issues**
1. Check JWT_SECRET environment variable
2. Verify token expiration
3. Check token format
4. Verify token validation

## **📝 Notes**

- Test page available at `/test-api`
- Real API endpoint: `/auth/login`
- Mock API endpoint: `/auth/test-login`
- All responses include role information
- Console logging enabled for debugging

