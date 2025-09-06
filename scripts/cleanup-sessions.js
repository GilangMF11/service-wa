#!/usr/bin/env node

/**
 * Script untuk membersihkan session WhatsApp yang tidak valid
 * Digunakan saat pindah komputer atau ada masalah dengan session
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Database configuration
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'whatsapp_api',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.NODE_ENV === 'production'
});

const cleanupSessions = async () => {
    try {
        console.log('🧹 Starting session cleanup...');
        
        // 1. Hapus semua session dari database
        console.log('🗑️  Clearing all sessions from database...');
        const deleteResult = await pool.query('DELETE FROM whatsapp_sessions');
        console.log(`✅ Deleted ${deleteResult.rowCount} sessions from database`);
        
        // 2. Hapus folder sessions
        const sessionsDir = path.join(__dirname, '..', 'sessions');
        if (fs.existsSync(sessionsDir)) {
            console.log('🗑️  Removing sessions directory...');
            fs.rmSync(sessionsDir, { recursive: true, force: true });
            console.log('✅ Sessions directory removed');
        }
        
        // 3. Hapus folder temp
        const tempDir = path.join(__dirname, '..', 'temp');
        if (fs.existsSync(tempDir)) {
            console.log('🗑️  Removing temp directory...');
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log('✅ Temp directory removed');
        }
        
        // 4. Hapus folder uploads (opsional)
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        if (fs.existsSync(uploadsDir)) {
            console.log('🗑️  Removing uploads directory...');
            fs.rmSync(uploadsDir, { recursive: true, force: true });
            console.log('✅ Uploads directory removed');
        }
        
        console.log('🎉 Session cleanup completed successfully!');
        console.log('💡 You can now restart the server and create new sessions');
        
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

// Run cleanup if called directly
if (require.main === module) {
    cleanupSessions();
}

module.exports = { cleanupSessions };
