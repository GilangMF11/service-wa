// db.js
require('dotenv').config();
const { Pool } = require('pg');

// Konfigurasi koneksi database dari environment variables
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    // Tambahan konfigurasi untuk production
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test koneksi database
const testConnection = async () => {
    try {
        const client = await pool.connect();
        console.log('✅ Koneksi database berhasil');
        client.release();
        return true;
    } catch (error) {
        console.error('❌ Koneksi database gagal:', error.message);
        return false;
    }
};

// Inisialisasi tabel
const initDatabase = async () => {
    try {
        // Buat enum types
        await pool.query(`
            DO $$ BEGIN
                CREATE TYPE message_type AS ENUM ('text', 'image', 'document', 'audio', 'video');
            EXCEPTION WHEN duplicate_object THEN null; END $$;
            DO $$ BEGIN
                CREATE TYPE campaign_status AS ENUM ('draft', 'sending', 'completed', 'failed', 'paused');
            EXCEPTION WHEN duplicate_object THEN null; END $$;
            DO $$ BEGIN
                CREATE TYPE message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
            EXCEPTION WHEN duplicate_object THEN null; END $$;
        `);

        // Create Tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE,
                role VARCHAR(20) DEFAULT 'user',
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS whatsapp_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                session_id VARCHAR(100) UNIQUE NOT NULL,
                session_data TEXT,
                description TEXT,
                is_active BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS broadcast_lists (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                session_id VARCHAR(36) NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS broadcast_contacts (
                id SERIAL PRIMARY KEY,
                broadcast_list_id INTEGER NOT NULL REFERENCES broadcast_lists(id) ON DELETE CASCADE,
                contact_number VARCHAR(20) NOT NULL,
                contact_name VARCHAR(100),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(broadcast_list_id, contact_number)
            );

            CREATE TABLE IF NOT EXISTS broadcast_campaigns (
                id SERIAL PRIMARY KEY,
                broadcast_list_id INTEGER NOT NULL REFERENCES broadcast_lists(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                session_id VARCHAR(36) NOT NULL,
                campaign_name VARCHAR(100) NOT NULL,
                message_type message_type DEFAULT 'text',
                message_content TEXT NOT NULL,
                media_url VARCHAR(500),
                media_filename VARCHAR(255),
                total_contacts INTEGER DEFAULT 0,
                sent_count INTEGER DEFAULT 0,
                failed_count INTEGER DEFAULT 0,
                status campaign_status DEFAULT 'draft',
                delay_ms INTEGER DEFAULT 1000,
                scheduled_at TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS broadcast_messages (
                id SERIAL PRIMARY KEY,
                campaign_id INTEGER NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
                contact_number VARCHAR(20) NOT NULL,
                contact_name VARCHAR(100),
                message_id VARCHAR(100),
                status message_status DEFAULT 'pending',
                error_message TEXT,
                sent_at TIMESTAMP,
                delivered_at TIMESTAMP,
                read_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        console.log('✅ Tabel database berhasil diinisialisasi');
        return true;
    } catch (error) {
        console.error('❌ Gagal menginisialisasi tabel database:', error.message);
        return false;
    }
};

// Graceful shutdown
process.on('SIGINT', async () => {
    await pool.end();
    process.exit(0);
});

// Import modular queries using getters to avoid circular dependency issues if they exist
module.exports = {
    pool,
    testConnection,
    initDatabase,
    get userQueries() { return require('./models/userQueries'); },
    get whatsappSessionQueries() { return require('./models/sessionQueries'); },
    get broadcastQueries() { return require('./models/broadcastQueries'); }
};