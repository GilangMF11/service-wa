#!/usr/bin/env node

/**
 * Script untuk memperbaiki masalah QR code yang tidak bisa konek
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

const fixQrConnection = async () => {
    try {
        console.log('🔧 Starting QR connection fix...');
        
        // 1. Hapus semua QR code dari database
        console.log('🗑️  Clearing QR codes from database...');
        const clearQrResult = await pool.query(`
            UPDATE whatsapp_sessions 
            SET session_data = session_data - 'qrCode'
            WHERE session_data ? 'qrCode'
        `);
        console.log(`✅ Cleared QR codes from ${clearQrResult.rowCount} sessions`);
        
        // 2. Reset semua session status
        console.log('🔄 Resetting session status...');
        const resetStatusResult = await pool.query(`
            UPDATE whatsapp_sessions 
            SET is_active = false, updated_at = NOW()
        `);
        console.log(`✅ Reset status for ${resetStatusResult.rowCount} sessions`);
        
        // 3. Hapus folder sessions yang bermasalah
        const sessionsDir = path.join(__dirname, '..', 'sessions');
        if (fs.existsSync(sessionsDir)) {
            console.log('🗑️  Removing problematic session directories...');
            const sessionFolders = fs.readdirSync(sessionsDir);
            
            for (const folder of sessionFolders) {
                if (folder.startsWith('session-')) {
                    const folderPath = path.join(sessionsDir, folder);
                    try {
                        fs.rmSync(folderPath, { recursive: true, force: true });
                        console.log(`✅ Removed: ${folder}`);
                    } catch (error) {
                        console.warn(`⚠️  Could not remove ${folder}:`, error.message);
                    }
                }
            }
        }
        
        // 4. Hapus folder temp
        const tempDir = path.join(__dirname, '..', 'temp');
        if (fs.existsSync(tempDir)) {
            console.log('🗑️  Cleaning temp directory...');
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log('✅ Temp directory cleaned');
        }
        
        console.log('🎉 QR connection fix completed!');
        console.log('💡 You can now restart the server and create new sessions');
        console.log('💡 QR codes should work properly now');
        
    } catch (error) {
        console.error('❌ Error during QR connection fix:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

// Run fix if called directly
if (require.main === module) {
    fixQrConnection();
}

module.exports = { fixQrConnection };
