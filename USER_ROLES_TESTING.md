# User Roles Testing Guide

## **🔐 Test Accounts**

### **Admin User**
- **Username:** `admin`
- **Password:** `admin`
- **Role:** `admin`
- **Access:** Full access including `/users` page

### **Regular User**
- **Username:** `user`
- **Password:** `user`
- **Role:** `user`
- **Access:** Limited access, no `/users` page

## **🧪 Testing Steps**

### **1. Test Admin Login**
1. Go to `/auth/login`
2. Login with `admin` / `admin`
3. Check console logs:
   ```
   🔍 Login response: {success: true, user: {role: "admin"}}
   🔍 User role from API: admin
   ✅ User is admin, showing menu
   ```
4. Verify menu "Users" is visible
5. Click on "Users" menu - should access `/users` page

### **2. Test Regular User Login**
1. Go to `/auth/login`
2. Login with `user` / `user`
3. Check console logs:
   ```
   🔍 Login response: {success: true, user: {role: "user"}}
   🔍 User role from API: user
   ❌ User is not admin, hiding menu. Role: user
   ```
4. Verify menu "Users" is NOT visible
5. Try to access `/users` directly - should get 403 error

### **3. Test Role-Based Access Control**

#### **Frontend Validation**
- Menu visibility based on role
- Token passing via query parameter
- Console logging for debugging

#### **Backend Validation**
- JWT token verification
- Role checking in middleware
- Session validation
- Query parameter token support

## **🔍 Debug Console Logs**

### **Successful Admin Login**
```
🔍 Login response: {
  success: true,
  message: "Login berhasil",
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  user: {
    id: 1,
    username: "admin",
    role: "admin"
  }
}
🔍 User role from API: admin
🔍 Checking user role...
Token exists: true
User data exists: true
Users menu item found: true
🔍 User data from localStorage: {id: 1, username: "admin", role: "admin"}
🔍 User role from localStorage: admin
✅ User is admin, showing menu
🔗 Updated users link with token
```

### **Regular User Login**
```
🔍 Login response: {
  success: true,
  message: "Login berhasil",
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  user: {
    id: 2,
    username: "user",
    role: "user"
  }
}
🔍 User role from API: user
🔍 Checking user role...
Token exists: true
User data exists: true
Users menu item found: true
🔍 User data from localStorage: {id: 2, username: "user", role: "user"}
🔍 User role from localStorage: user
❌ User is not admin, hiding menu. Role: user
```

## **🛠️ API Response Format**

### **Login Success Response**
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

### **JWT Token Payload**
```json
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "iat": 1234567890,
  "exp": 1234567890
}
```

## **🔧 Troubleshooting**

### **Menu Users Not Showing**
1. Check console for role logs
2. Verify localStorage has user data
3. Check if role is 'admin'
4. Verify menu element exists

### **403 Error on /users**
1. Check if token is passed in URL
2. Verify middleware logs
3. Check JWT token validity
4. Verify role in token payload

### **Login Issues**
1. Check API response format
2. Verify role is included in response
3. Check localStorage storage
4. Verify token format

## **📝 Notes**

- Role is parsed from API response and stored in localStorage
- Frontend uses localStorage user data for role checking
- Backend validates JWT token and role
- Menu visibility is controlled by frontend JavaScript
- Access control is enforced by backend middleware

