#!/usr/bin/env node

/**
 * Script untuk memigrasi session WhatsApp antar komputer
 * Menyimpan session data ke database dan memuatnya di komputer lain
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

const migrateSessions = async () => {
    try {
        console.log('🚀 Starting session migration...');
        
        // 1. Backup session data ke database
        console.log('💾 Backing up session data to database...');
        const sessionsDir = path.join(__dirname, '..', 'sessions');
        
        if (fs.existsSync(sessionsDir)) {
            const sessionFolders = fs.readdirSync(sessionsDir);
            console.log(`📁 Found ${sessionFolders.length} session folders`);
            
            for (const folder of sessionFolders) {
                if (folder.startsWith('session-')) {
                    const sessionId = folder.replace('session-', '');
                    const sessionPath = path.join(sessionsDir, folder);
                    
                    try {
                        // Compress session folder
                        const zipPath = path.join(__dirname, '..', 'temp', `${sessionId}.zip`);
                        const tempDir = path.dirname(zipPath);
                        
                        if (!fs.existsSync(tempDir)) {
                            fs.mkdirSync(tempDir, { recursive: true });
                        }
                        
                        // Create zip file (requires zip command)
                        execSync(`cd "${sessionsDir}" && zip -r "${zipPath}" "${folder}"`, { stdio: 'pipe' });
                        
                        // Read zip file as buffer
                        const zipBuffer = fs.readFileSync(zipPath);
                        
                        // Save to database
                        await pool.query(`
                            INSERT INTO whatsapp_sessions (session_id, session_data, is_active, created_at, updated_at)
                            VALUES ($1, $2, $3, NOW(), NOW())
                            ON CONFLICT (session_id) 
                            DO UPDATE SET 
                                session_data = EXCLUDED.session_data,
                                updated_at = NOW()
                        `, [sessionId, JSON.stringify({
                            sessionData: zipBuffer.toString('base64'),
                            migratedAt: new Date().toISOString(),
                            version: '1.0'
                        }), false]);
                        
                        console.log(`✅ Migrated session: ${sessionId}`);
                        
                        // Clean up zip file
                        fs.unlinkSync(zipPath);
                        
                    } catch (error) {
                        console.error(`❌ Error migrating session ${sessionId}:`, error.message);
                    }
                }
            }
        } else {
            console.log('⚠️  No sessions directory found');
        }
        
        console.log('🎉 Session migration completed!');
        console.log('💡 Session data is now stored in the database');
        console.log('💡 You can now pull this code on another computer and the sessions will be available');
        
    } catch (error) {
        console.error('❌ Error during migration:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

const restoreSessions = async () => {
    try {
        console.log('🔄 Restoring sessions from database...');
        
        // Get all sessions from database
        const result = await pool.query(`
            SELECT session_id, session_data 
            FROM whatsapp_sessions 
            WHERE session_data IS NOT NULL
        `);
        
        console.log(`📁 Found ${result.rows.length} sessions in database`);
        
        const sessionsDir = path.join(__dirname, '..', 'sessions');
        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir, { recursive: true });
        }
        
        for (const row of result.rows) {
            try {
                const { session_id, session_data } = row;
                const sessionInfo = JSON.parse(session_data);
                
                if (sessionInfo.sessionData) {
                    // Create session folder
                    const sessionFolder = `session-${session_id}`;
                    const sessionPath = path.join(sessionsDir, sessionFolder);
                    
                    if (!fs.existsSync(sessionPath)) {
                        fs.mkdirSync(sessionPath, { recursive: true });
                    }
                    
                    // Write session data
                    const zipPath = path.join(__dirname, '..', 'temp', `${session_id}.zip`);
                    const tempDir = path.dirname(zipPath);
                    
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }
                    
                    fs.writeFileSync(zipPath, Buffer.from(sessionInfo.sessionData, 'base64'));
                    
                    // Extract zip file
                    execSync(`cd "${sessionsDir}" && unzip -o "${zipPath}"`, { stdio: 'pipe' });
                    
                    // Clean up zip file
                    fs.unlinkSync(zipPath);
                    
                    console.log(`✅ Restored session: ${session_id}`);
                }
            } catch (error) {
                console.error(`❌ Error restoring session ${row.session_id}:`, error.message);
            }
        }
        
        console.log('🎉 Session restoration completed!');
        
    } catch (error) {
        console.error('❌ Error during restoration:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

// Command line interface
const command = process.argv[2];

if (command === 'migrate') {
    migrateSessions();
} else if (command === 'restore') {
    restoreSessions();
} else {
    console.log('Usage:');
    console.log('  node migrate-sessions.js migrate  - Save sessions to database');
    console.log('  node migrate-sessions.js restore  - Restore sessions from database');
}

module.exports = { migrateSessions, restoreSessions };
