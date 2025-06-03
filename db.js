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
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Test koneksi database
const testConnection = async () => {
    try {
        const client = await pool.connect();
        console.log('✅ Koneksi database berhasil');
        console.log(`📊 Database: ${process.env.DB_NAME} on ${process.env.DB_HOST}:${process.env.DB_PORT}`);
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
        // Buat enum types terlebih dahulu
        await pool.query(`
            DO $$ BEGIN
                CREATE TYPE message_type AS ENUM ('text', 'image', 'document', 'audio', 'video');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        await pool.query(`
            DO $$ BEGIN
                CREATE TYPE campaign_status AS ENUM ('draft', 'sending', 'completed', 'failed', 'paused');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        await pool.query(`
            DO $$ BEGIN
                CREATE TYPE message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // Buat tabel users jika belum ada
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE,
                role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Buat tabel whatsapp_sessions jika belum ada
        await pool.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                session_id VARCHAR(100) UNIQUE NOT NULL,
                session_data TEXT,
                description TEXT,
                is_active BOOLEAN DEFAULT false,
                is_multi_device BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Buat tabel broadcast_lists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS broadcast_lists (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                session_id VARCHAR(36) NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Buat tabel broadcast_contacts
        await pool.query(`
            CREATE TABLE IF NOT EXISTS broadcast_contacts (
                id SERIAL PRIMARY KEY,
                broadcast_list_id INTEGER NOT NULL REFERENCES broadcast_lists(id) ON DELETE CASCADE,
                contact_number VARCHAR(20) NOT NULL,
                contact_name VARCHAR(100),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(broadcast_list_id, contact_number)
            )
        `);

        // Buat tabel broadcast_campaigns
        await pool.query(`
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
            )
        `);

        // Buat tabel broadcast_messages
        await pool.query(`
            CREATE TABLE IF NOT EXISTS broadcast_messages (
                id SERIAL PRIMARY KEY,
                campaign_id INTEGER NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
                contact_number VARCHAR(20) NOT NULL,
                contact_name VARCHAR(100),
                message_id VARCHAR(100), -- ID dari WhatsApp
                status message_status DEFAULT 'pending',
                error_message TEXT,
                sent_at TIMESTAMP,
                delivered_at TIMESTAMP,
                read_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Buat indexes untuk performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_broadcast_lists_user_session 
            ON broadcast_lists(user_id, session_id);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_list 
            ON broadcast_contacts(broadcast_list_id);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_list 
            ON broadcast_campaigns(broadcast_list_id);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_status 
            ON broadcast_campaigns(status);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_broadcast_messages_campaign 
            ON broadcast_messages(campaign_id);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_broadcast_messages_status 
            ON broadcast_messages(status);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_user 
            ON whatsapp_sessions(user_id);
        `);

        console.log('✅ Tabel database berhasil diinisialisasi');
        console.log('📋 Tabel: users, whatsapp_sessions, broadcast_lists, broadcast_contacts, broadcast_campaigns, broadcast_messages');
        return true;
    } catch (error) {
        console.error('❌ Gagal menginisialisasi tabel database:', error.message);
        return false;
    }
};

// Query untuk user
const userQueries = {
    // Ambil semua users dengan pagination dan search
    getAllUsers: async (limit = 10, offset = 0, search = '') => {
        const searchQuery = search ?
            `WHERE username ILIKE $3 OR email ILIKE $3` : '';

        const query = `
            SELECT id, username, email, role, is_active, created_at 
            FROM users 
            ${searchQuery}
            ORDER BY created_at DESC 
            LIMIT $1 OFFSET $2
        `;

        const params = search ?
            [limit, offset, `%${search}%`] :
            [limit, offset];

        const result = await pool.query(query, params);
        return result.rows;
    },

    // Hitung total users untuk pagination
    getTotalUsers: async (search = '') => {
        const searchQuery = search ?
            `WHERE username ILIKE $1 OR email ILIKE $1` : '';

        const query = `SELECT COUNT(*) as total FROM users ${searchQuery}`;
        const params = search ? [`%${search}%`] : [];

        const result = await pool.query(query, params);
        return parseInt(result.rows[0].total);
    },

    // Mendapatkan user berdasarkan username
    getUserByUsername: async (username) => {
        const query = 'SELECT * FROM users WHERE username = $1 AND is_active = true';
        const result = await pool.query(query, [username]);
        return result.rows[0];
    },

    // Ambil user berdasarkan email
    getUserByEmail: async (email) => {
        const query = 'SELECT * FROM users WHERE email = $1 AND is_active = true';
        const result = await pool.query(query, [email]);
        return result.rows[0];
    },

    // Mendapatkan user berdasarkan id
    getUserById: async (id) => {
        const query = 'SELECT * FROM users WHERE id = $1 AND is_active = true';
        const result = await pool.query(query, [id]);
        return result.rows[0];
    },

    // Menambahkan user baru
    createUser: async (username, hashedPassword, email) => {
        const query = `
            INSERT INTO users (username, password, email) 
            VALUES ($1, $2, $3) 
            RETURNING id, username, email, role, is_active, created_at
        `;
        const result = await pool.query(query, [username, hashedPassword, email]);
        return result.rows[0];
    },

    // Update user
    updateUser: async (id, updateData) => {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        // Bangun query dinamis berdasarkan field yang diupdate
        for (const [key, value] of Object.entries(updateData)) {
            fields.push(`${key} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        }

        if (fields.length === 0) {
            throw new Error('Tidak ada data untuk diupdate');
        }

        // Tambahkan updated_at
        fields.push(`updated_at = NOW()`);
        values.push(id); // ID sebagai parameter terakhir

        const query = `
            UPDATE users 
            SET ${fields.join(', ')} 
            WHERE id = $${paramIndex}
            RETURNING id, username, email, role, is_active, created_at, updated_at
        `;

        const result = await pool.query(query, values);
        return result.rows[0];
    },

    // Hapus user (soft delete)
    deleteUser: async (id) => {
        const query = 'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rowCount > 0;
    },

    // Hard delete user
    hardDeleteUser: async (id) => {
        const query = 'DELETE FROM users WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rowCount > 0;
    }
};

// Query untuk session WhatsApp
const whatsappSessionQueries = {
    // Mendapatkan semua session WhatsApp
    getAllSessions: async () => {
        const query = `
            SELECT ws.*, u.username 
            FROM whatsapp_sessions ws
            JOIN users u ON ws.user_id = u.id
            WHERE u.is_active = true
            ORDER BY ws.created_at DESC
        `;
        const result = await pool.query(query);
        return result.rows;
    },

    // Mendapatkan session WhatsApp berdasarkan user_id
    getSessionsByUserId: async (userId) => {
        const query = 'SELECT * FROM whatsapp_sessions WHERE user_id = $1 ORDER BY created_at DESC';
        const result = await pool.query(query, [userId]);
        return result.rows;
    },

    // Mendapatkan session WhatsApp berdasarkan session_id
    getSessionBySessionId: async (sessionId) => {
        const query = 'SELECT * FROM whatsapp_sessions WHERE session_id = $1';
        const result = await pool.query(query, [sessionId]);
        return result.rows[0];
    },

    // Membuat session WhatsApp baru
    createSession: async (userId, sessionId, description = null) => {
        const query = `
            INSERT INTO whatsapp_sessions 
            (user_id, session_id, description) 
            VALUES ($1, $2, $3) 
            RETURNING *
        `;
        const result = await pool.query(query, [userId, sessionId, description]);
        return result.rows[0];
    },

    // Memperbarui data session WhatsApp
    updateSessionData: async (sessionId, sessionData) => {
        const query = `
            UPDATE whatsapp_sessions 
            SET session_data = $1, updated_at = NOW() 
            WHERE session_id = $2
            RETURNING *
        `;
        const result = await pool.query(query, [sessionData, sessionId]);
        return result.rows[0];
    },

    // Memperbarui status session WhatsApp
    updateSessionStatus: async (sessionId, isActive) => {
        const query = `
            UPDATE whatsapp_sessions 
            SET is_active = $1, updated_at = NOW() 
            WHERE session_id = $2
            RETURNING *
        `;
        const result = await pool.query(query, [isActive, sessionId]);
        return result.rows[0];
    },

    // Memperbarui deskripsi session WhatsApp
    updateSessionDescription: async (sessionId, description) => {
        const query = `
            UPDATE whatsapp_sessions 
            SET description = $1, updated_at = NOW() 
            WHERE session_id = $2
            RETURNING *
        `;
        const result = await pool.query(query, [description, sessionId]);
        return result.rows[0];
    },

    // Menghapus session WhatsApp
    deleteSession: async (sessionId) => {
        const query = 'DELETE FROM whatsapp_sessions WHERE session_id = $1 RETURNING *';
        const result = await pool.query(query, [sessionId]);
        return result.rows[0];
    }
};

// Query untuk broadcast
const broadcastQueries = {
    // === BROADCAST LISTS ===

    // Buat broadcast list baru
    createBroadcastList: async (userId, sessionId, name, description) => {
        const query = `
            INSERT INTO broadcast_lists (user_id, session_id, name, description) 
            VALUES ($1, $2, $3, $4) 
            RETURNING *
        `;
        const result = await pool.query(query, [userId, sessionId, name, description]);
        return result.rows[0];
    },

    // Get broadcast lists by user
    getBroadcastListsByUser: async (userId, sessionId, limit = 10, offset = 0) => {
        const query = `
            SELECT bl.*, 
                   COUNT(bc.id) as contact_count,
                   COUNT(bcm.id) as campaign_count
            FROM broadcast_lists bl
            LEFT JOIN broadcast_contacts bc ON bl.id = bc.broadcast_list_id AND bc.is_active = true
            LEFT JOIN broadcast_campaigns bcm ON bl.id = bcm.broadcast_list_id
            WHERE bl.user_id = $1 AND bl.session_id = $2 AND bl.is_active = true
            GROUP BY bl.id
            ORDER BY bl.created_at DESC
            LIMIT $3 OFFSET $4
        `;
        const result = await pool.query(query, [userId, sessionId, limit, offset]);
        return result.rows;
    },

    // Get broadcast list by ID
    getBroadcastListById: async (listId, userId) => {
        const query = `
            SELECT bl.*, 
                   COUNT(bc.id) as contact_count
            FROM broadcast_lists bl
            LEFT JOIN broadcast_contacts bc ON bl.id = bc.broadcast_list_id AND bc.is_active = true
            WHERE bl.id = $1 AND bl.user_id = $2 AND bl.is_active = true
            GROUP BY bl.id
        `;
        const result = await pool.query(query, [listId, userId]);
        return result.rows[0];
    },

    // Update broadcast list
    updateBroadcastList: async (listId, userId, name, description) => {
        const query = `
            UPDATE broadcast_lists 
            SET name = $3, description = $4, updated_at = NOW() 
            WHERE id = $1 AND user_id = $2 AND is_active = true
            RETURNING *
        `;
        const result = await pool.query(query, [listId, userId, name, description]);
        return result.rows[0];
    },

    // Delete broadcast list (soft delete)
    deleteBroadcastList: async (listId, userId) => {
        const query = `
            UPDATE broadcast_lists 
            SET is_active = false, updated_at = NOW() 
            WHERE id = $1 AND user_id = $2
        `;
        const result = await pool.query(query, [listId, userId]);
        return result.rowCount > 0;
    },

    // === BROADCAST CONTACTS ===

    // Add contact to broadcast list
    addContactToBroadcastList: async (listId, contactNumber, contactName) => {
        const query = `
            INSERT INTO broadcast_contacts (broadcast_list_id, contact_number, contact_name) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (broadcast_list_id, contact_number) 
            DO UPDATE SET is_active = true, contact_name = $3
            RETURNING *
        `;
        const result = await pool.query(query, [listId, contactNumber, contactName]);
        return result.rows[0];
    },

    // Add multiple contacts to broadcast list
    addMultipleContactsToBroadcastList: async (listId, contacts) => {
        if (!contacts || contacts.length === 0) return [];

        const values = contacts.map((_, index) =>
            `($1, $${index * 2 + 2}, $${index * 2 + 3})`
        ).join(', ');

        const params = [listId];
        contacts.forEach(contact => {
            params.push(contact.number, contact.name);
        });

        const query = `
            INSERT INTO broadcast_contacts (broadcast_list_id, contact_number, contact_name) 
            VALUES ${values}
            ON CONFLICT (broadcast_list_id, contact_number) 
            DO UPDATE SET is_active = true, contact_name = EXCLUDED.contact_name
            RETURNING *
        `;
        const result = await pool.query(query, params);
        return result.rows;
    },

    // Get contacts in broadcast list
    getContactsInBroadcastList: async (listId, limit = 50, offset = 0) => {
        const query = `
            SELECT * FROM broadcast_contacts 
            WHERE broadcast_list_id = $1 AND is_active = true
            ORDER BY contact_name ASC, contact_number ASC
            LIMIT $2 OFFSET $3
        `;
        const result = await pool.query(query, [listId, limit, offset]);
        return result.rows;
    },

    // Remove contact from broadcast list
    removeContactFromBroadcastList: async (listId, contactNumber) => {
        const query = `
            UPDATE broadcast_contacts 
            SET is_active = false 
            WHERE broadcast_list_id = $1 AND contact_number = $2
        `;
        const result = await pool.query(query, [listId, contactNumber]);
        return result.rowCount > 0;
    },

    // === BROADCAST CAMPAIGNS ===

    // Create broadcast campaign
    createBroadcastCampaign: async (listId, userId, sessionId, campaignName, messageType, messageContent, mediaUrl, mediaFilename, totalContacts, delayMs = 1000) => {
        const query = `
            INSERT INTO broadcast_campaigns 
            (broadcast_list_id, user_id, session_id, campaign_name, message_type, message_content, media_url, media_filename, total_contacts, delay_ms) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
            RETURNING *
        `;
        const result = await pool.query(query, [listId, userId, sessionId, campaignName, messageType, messageContent, mediaUrl, mediaFilename, totalContacts, delayMs]);
        return result.rows[0];
    },

    // Get broadcast campaigns
    getBroadcastCampaigns: async (userId, sessionId, limit = 10, offset = 0) => {
        const query = `
            SELECT bc.*, bl.name as list_name
            FROM broadcast_campaigns bc
            JOIN broadcast_lists bl ON bc.broadcast_list_id = bl.id
            WHERE bc.user_id = $1 AND bc.session_id = $2
            ORDER BY bc.created_at DESC
            LIMIT $3 OFFSET $4
        `;
        const result = await pool.query(query, [userId, sessionId, limit, offset]);
        return result.rows;
    },

    // Get campaign by ID
    getCampaignById: async (campaignId, userId) => {
        const query = `
            SELECT bc.*, bl.name as list_name
            FROM broadcast_campaigns bc
            JOIN broadcast_lists bl ON bc.broadcast_list_id = bl.id
            WHERE bc.id = $1 AND bc.user_id = $2
        `;
        const result = await pool.query(query, [campaignId, userId]);
        return result.rows[0];
    },

    // Update campaign status
    updateCampaignStatus: async (campaignId, status, startedAt = null, completedAt = null) => {
        const updates = ['status = $2', 'updated_at = NOW()'];
        const params = [campaignId, status];
        let paramIndex = 3;

        if (startedAt) {
            updates.push(`started_at = $${paramIndex}`);
            params.push(startedAt);
            paramIndex++;
        }

        if (completedAt) {
            updates.push(`completed_at = $${paramIndex}`);
            params.push(completedAt);
            paramIndex++;
        }

        const query = `
            UPDATE broadcast_campaigns 
            SET ${updates.join(', ')}
            WHERE id = $1
            RETURNING *
        `;
        const result = await pool.query(query, params);
        return result.rows[0];
    },

    // Update campaign counts
    updateCampaignCounts: async (campaignId, sentCount, failedCount) => {
        const query = `
            UPDATE broadcast_campaigns 
            SET sent_count = $2, failed_count = $3, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `;
        const result = await pool.query(query, [campaignId, sentCount, failedCount]);
        return result.rows[0];
    },

    // === BROADCAST MESSAGES ===

    // Create broadcast message records
    createBroadcastMessages: async (campaignId, contacts) => {
        if (!contacts || contacts.length === 0) return [];

        const values = contacts.map((_, index) =>
            `($1, $${index * 2 + 2}, $${index * 2 + 3})`
        ).join(', ');

        const params = [campaignId];
        contacts.forEach(contact => {
            params.push(contact.contact_number, contact.contact_name);
        });

        const query = `
            INSERT INTO broadcast_messages (campaign_id, contact_number, contact_name) 
            VALUES ${values}
            RETURNING *
        `;
        const result = await pool.query(query, params);
        return result.rows;
    },

    // Update broadcast message status
    updateBroadcastMessageStatus: async (messageId, status, messageIdFromWA = null, errorMessage = null) => {
        const updates = ['status = $2', 'updated_at = NOW()'];
        const params = [messageId, status];
        let paramIndex = 3;

        if (messageIdFromWA) {
            updates.push(`message_id = $${paramIndex}`);
            params.push(messageIdFromWA);
            paramIndex++;
        }

        if (errorMessage) {
            updates.push(`error_message = $${paramIndex}`);
            params.push(errorMessage);
            paramIndex++;
        }

        if (status === 'sent') {
            updates.push(`sent_at = NOW()`);
        } else if (status === 'delivered') {
            updates.push(`delivered_at = NOW()`);
        } else if (status === 'read') {
            updates.push(`read_at = NOW()`);
        }

        const query = `
            UPDATE broadcast_messages 
            SET ${updates.join(', ')}
            WHERE id = $1
            RETURNING *
        `;
        const result = await pool.query(query, params);
        return result.rows[0];
    },

    // Get broadcast messages by campaign
    getBroadcastMessagesByCampaign: async (campaignId, limit = 50, offset = 0) => {
        const query = `
            SELECT * FROM broadcast_messages 
            WHERE campaign_id = $1
            ORDER BY created_at ASC
            LIMIT $2 OFFSET $3
        `;
        const result = await pool.query(query, [campaignId, limit, offset]);
        return result.rows;
    },

    // Get broadcast statistics
    getBroadcastStatistics: async (campaignId) => {
        const query = `
            SELECT 
                status,
                COUNT(*) as count
            FROM broadcast_messages 
            WHERE campaign_id = $1
            GROUP BY status
        `;
        const result = await pool.query(query, [campaignId]);
        return result.rows;
    },

    // Get pending messages for a campaign
    getPendingMessages: async (campaignId, limit = 100) => {
        const query = `
            SELECT * FROM broadcast_messages 
            WHERE campaign_id = $1 AND status = 'pending'
            ORDER BY created_at ASC
            LIMIT $2
        `;
        const result = await pool.query(query, [campaignId, limit]);
        return result.rows;
    },

    // Get broadcast overview statistics
    getBroadcastOverviewStats: async (userId, sessionId) => {
        const query = `
        SELECT 
            (SELECT COUNT(*) FROM broadcast_lists WHERE user_id = $1 AND session_id = $2 AND is_active = true) as total_lists,
            (SELECT COUNT(*) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2) as total_campaigns,
            (SELECT COUNT(*) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2 AND status = 'completed') as completed_campaigns,
            (SELECT COUNT(*) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2 AND status = 'sending') as active_campaigns,
            (SELECT COALESCE(SUM(sent_count), 0) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2) as total_sent,
            (SELECT COALESCE(SUM(failed_count), 0) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2) as total_failed
    `;

        const result = await pool.query(query, [userId, sessionId]);
        return result.rows[0];
    },

    // Get campaign by ID with additional validation
    getCampaignById: async (campaignId, userId = null) => {
        const userQuery = userId ? `AND bc.user_id = $2` : '';

        const query = `
        SELECT bc.*, bl.name as list_name
        FROM broadcast_campaigns bc
        JOIN broadcast_lists bl ON bc.broadcast_list_id = bl.id
        WHERE bc.id = $1 ${userQuery}
    `;

        const params = userId ? [campaignId, userId] : [campaignId];
        const result = await pool.query(query, params);
        return result.rows[0];
    },

    getBroadcastListsByUser: async (userId, sessionId, limit = 10, offset = 0, search = '') => {
        const searchQuery = search ? 
            `AND (bl.name ILIKE $5 OR bl.description ILIKE $5)` : '';
        
        const query = `
            SELECT bl.*, 
                   COUNT(bc.id) as contact_count,
                   COUNT(bcm.id) as campaign_count
            FROM broadcast_lists bl
            LEFT JOIN broadcast_contacts bc ON bl.id = bc.broadcast_list_id AND bc.is_active = true
            LEFT JOIN broadcast_campaigns bcm ON bl.id = bcm.broadcast_list_id
            WHERE bl.user_id = $1 AND bl.session_id = $2 AND bl.is_active = true
            ${searchQuery}
            GROUP BY bl.id
            ORDER BY bl.created_at DESC
            LIMIT $3 OFFSET $4
        `;
        
        const params = search ? 
            [userId, sessionId, limit, offset, `%${search}%`] : 
            [userId, sessionId, limit, offset];
            
        const result = await pool.query(query, params);
        return result.rows;
    },
    
    // Get total broadcast lists count
    getTotalBroadcastLists: async (userId, sessionId, search = '') => {
        const searchQuery = search ? 
            `AND (name ILIKE $3 OR description ILIKE $3)` : '';
        
        const query = `
            SELECT COUNT(*) as total 
            FROM broadcast_lists 
            WHERE user_id = $1 AND session_id = $2 AND is_active = true
            ${searchQuery}
        `;
        
        const params = search ? [userId, sessionId, `%${search}%`] : [userId, sessionId];
        const result = await pool.query(query, params);
        return parseInt(result.rows[0].total);
    },
    
    // Get contacts with search functionality
    getContactsInBroadcastList: async (listId, limit = 50, offset = 0, search = '') => {
        const searchQuery = search ? 
            `AND (contact_name ILIKE $4 OR contact_number ILIKE $4)` : '';
        
        const query = `
            SELECT * FROM broadcast_contacts 
            WHERE broadcast_list_id = $1 AND is_active = true
            ${searchQuery}
            ORDER BY contact_name ASC, contact_number ASC
            LIMIT $2 OFFSET $3
        `;
        
        const params = search ? 
            [listId, limit, offset, `%${search}%`] : 
            [listId, limit, offset];
            
        const result = await pool.query(query, params);
        return result.rows;
    },
    
    // Get total contacts count in list
    getTotalContactsInList: async (listId, search = '') => {
        const searchQuery = search ? 
            `AND (contact_name ILIKE $2 OR contact_number ILIKE $2)` : '';
        
        const query = `
            SELECT COUNT(*) as total 
            FROM broadcast_contacts 
            WHERE broadcast_list_id = $1 AND is_active = true
            ${searchQuery}
        `;
        
        const params = search ? [listId, `%${search}%`] : [listId];
        const result = await pool.query(query, params);
        return parseInt(result.rows[0].total);
    },
    
    // Update contact in broadcast list
    updateContactInBroadcastList: async (listId, contactNumber, contactName) => {
        const query = `
            UPDATE broadcast_contacts 
            SET contact_name = $3, updated_at = NOW()
            WHERE broadcast_list_id = $1 AND contact_number = $2 AND is_active = true
            RETURNING *
        `;
        const result = await pool.query(query, [listId, contactNumber, contactName]);
        return result.rows[0];
    },
    
    // Get broadcast campaigns with filtering
    getBroadcastCampaigns: async (userId, sessionId, limit = 10, offset = 0, status = null) => {
        const statusQuery = status ? `AND bc.status = $5` : '';
        
        const query = `
            SELECT bc.*, bl.name as list_name
            FROM broadcast_campaigns bc
            JOIN broadcast_lists bl ON bc.broadcast_list_id = bl.id
            WHERE bc.user_id = $1 AND bc.session_id = $2
            ${statusQuery}
            ORDER BY bc.created_at DESC
            LIMIT $3 OFFSET $4
        `;
        
        const params = status ? 
            [userId, sessionId, limit, offset, status] : 
            [userId, sessionId, limit, offset];
            
        const result = await pool.query(query, params);
        return result.rows;
    },
    
    // Get total broadcast campaigns count
    getTotalBroadcastCampaigns: async (userId, sessionId, status = null) => {
        const statusQuery = status ? `AND status = $3` : '';
        
        const query = `
            SELECT COUNT(*) as total 
            FROM broadcast_campaigns 
            WHERE user_id = $1 AND session_id = $2
            ${statusQuery}
        `;
        
        const params = status ? [userId, sessionId, status] : [userId, sessionId];
        const result = await pool.query(query, params);
        return parseInt(result.rows[0].total);
    },
    
    // Get broadcast overview statistics
    getBroadcastOverviewStats: async (userId, sessionId) => {
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM broadcast_lists WHERE user_id = $1 AND session_id = $2 AND is_active = true) as total_lists,
                (SELECT COUNT(*) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2) as total_campaigns,
                (SELECT COUNT(*) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2 AND status = 'completed') as completed_campaigns,
                (SELECT COUNT(*) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2 AND status = 'sending') as active_campaigns,
                (SELECT COALESCE(SUM(sent_count), 0) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2) as total_sent,
                (SELECT COALESCE(SUM(failed_count), 0) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2) as total_failed,
                (SELECT COUNT(DISTINCT bc.id) FROM broadcast_contacts bc 
                 JOIN broadcast_lists bl ON bc.broadcast_list_id = bl.id 
                 WHERE bl.user_id = $1 AND bl.session_id = $2 AND bc.is_active = true) as total_contacts
        `;
        
        const result = await pool.query(query, [userId, sessionId]);
        return result.rows[0];
    },
    
    // Get campaign by ID with additional validation
    getCampaignById: async (campaignId, userId = null) => {
        const userQuery = userId ? `AND bc.user_id = $2` : '';
        
        const query = `
            SELECT bc.*, bl.name as list_name
            FROM broadcast_campaigns bc
            JOIN broadcast_lists bl ON bc.broadcast_list_id = bl.id
            WHERE bc.id = $1 ${userQuery}
        `;
        
        const params = userId ? [campaignId, userId] : [campaignId];
        const result = await pool.query(query, params);
        return result.rows[0];
    },
    
    // Update campaign schedule
    updateCampaignSchedule: async (campaignId, scheduledAt) => {
        const query = `
            UPDATE broadcast_campaigns 
            SET scheduled_at = $2, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `;
        const result = await pool.query(query, [campaignId, scheduledAt]);
        return result.rows[0];
    },
    
    // Delete campaign
    deleteCampaign: async (campaignId) => {
        // First delete related messages
        await pool.query('DELETE FROM broadcast_messages WHERE campaign_id = $1', [campaignId]);
        
        // Then delete campaign
        const query = 'DELETE FROM broadcast_campaigns WHERE id = $1 RETURNING *';
        const result = await pool.query(query, [campaignId]);
        return result.rows[0];
    },
    
    // Get pending messages for campaign continuation
    getPendingMessages: async (campaignId, limit = 100) => {
        const query = `
            SELECT bm.*, bc.message_content, bc.message_type, bc.delay_ms
            FROM broadcast_messages bm
            JOIN broadcast_campaigns bc ON bm.campaign_id = bc.id
            WHERE bm.campaign_id = $1 AND bm.status = 'pending'
            ORDER BY bm.created_at ASC
            LIMIT $2
        `;
        const result = await pool.query(query, [campaignId, limit]);
        return result.rows;
    },
    
    // Get scheduled campaigns that need to be started
    getScheduledCampaigns: async () => {
        const query = `
            SELECT bc.*, bl.name as list_name
            FROM broadcast_campaigns bc
            JOIN broadcast_lists bl ON bc.broadcast_list_id = bl.id
            WHERE bc.status = 'draft' 
            AND bc.scheduled_at IS NOT NULL 
            AND bc.scheduled_at <= NOW()
            ORDER BY bc.scheduled_at ASC
        `;
        const result = await pool.query(query);
        return result.rows;
    },
    
    // Get campaign performance analytics
    getCampaignAnalytics: async (userId, sessionId, days = 30) => {
        const query = `
            SELECT 
                DATE(bc.created_at) as date,
                COUNT(*) as campaigns_sent,
                SUM(bc.total_contacts) as total_contacts,
                SUM(bc.sent_count) as total_sent,
                SUM(bc.failed_count) as total_failed,
                ROUND(
                    CASE 
                        WHEN SUM(bc.total_contacts) > 0 
                        THEN (SUM(bc.sent_count)::float / SUM(bc.total_contacts)::float) * 100 
                        ELSE 0 
                    END, 2
                ) as success_rate
            FROM broadcast_campaigns bc
            WHERE bc.user_id = $1 
            AND bc.session_id = $2 
            AND bc.created_at >= NOW() - INTERVAL '${days} days'
            AND bc.status IN ('completed', 'failed')
            GROUP BY DATE(bc.created_at)
            ORDER BY date DESC
        `;
        const result = await pool.query(query, [userId, sessionId]);
        return result.rows;
    },
    
    // Get top performing broadcast lists
    getTopPerformingLists: async (userId, sessionId, limit = 5) => {
        const query = `
            SELECT 
                bl.*,
                COUNT(bc.id) as total_campaigns,
                COALESCE(SUM(bc.sent_count), 0) as total_sent,
                COALESCE(SUM(bc.failed_count), 0) as total_failed,
                ROUND(
                    CASE 
                        WHEN SUM(bc.total_contacts) > 0 
                        THEN (SUM(bc.sent_count)::float / SUM(bc.total_contacts)::float) * 100 
                        ELSE 0 
                    END, 2
                ) as success_rate
            FROM broadcast_lists bl
            LEFT JOIN broadcast_campaigns bc ON bl.id = bc.broadcast_list_id
            WHERE bl.user_id = $1 AND bl.session_id = $2 AND bl.is_active = true
            GROUP BY bl.id
            HAVING COUNT(bc.id) > 0
            ORDER BY success_rate DESC, total_sent DESC
            LIMIT $3
        `;
        const result = await pool.query(query, [userId, sessionId, limit]);
        return result.rows;
    },
    
    // Clean up old completed campaigns (for maintenance)
    cleanupOldCampaigns: async (daysOld = 90) => {
        const query = `
            DELETE FROM broadcast_campaigns 
            WHERE status IN ('completed', 'failed') 
            AND completed_at < NOW() - INTERVAL '${daysOld} days'
            RETURNING id
        `;
        const result = await pool.query(query);
        return result.rows.length;
    },
    
    // Get campaign message details for troubleshooting
    getCampaignMessageDetails: async (campaignId, status = null, limit = 100, offset = 0) => {
        const statusQuery = status ? `AND bm.status = $2` : '';
        const limitOffset = status ? `LIMIT $3 OFFSET $4` : `LIMIT $2 OFFSET $3`;
        
        const query = `
            SELECT 
                bm.*,
                bc.campaign_name,
                bc.message_content,
                bl.name as list_name
            FROM broadcast_messages bm
            JOIN broadcast_campaigns bc ON bm.campaign_id = bc.id
            JOIN broadcast_lists bl ON bc.broadcast_list_id = bl.id
            WHERE bm.campaign_id = $1 ${statusQuery}
            ORDER BY bm.created_at ASC
            ${limitOffset}
        `;
        
        const params = status ? 
            [campaignId, status, limit, offset] : 
            [campaignId, limit, offset];
            
        const result = await pool.query(query, params);
        return result.rows;
    },
    
    // Update message status with webhook data (for delivery receipts)
    updateMessageStatusByMessageId: async (whatsappMessageId, status, timestamp = null) => {
        const timeQuery = timestamp ? `, ${status}_at = $3` : '';
        const query = `
            UPDATE broadcast_messages 
            SET status = $2, updated_at = NOW() ${timeQuery}
            WHERE message_id = $1
            RETURNING *
        `;
        
        const params = timestamp ? 
            [whatsappMessageId, status, timestamp] : 
            [whatsappMessageId, status];
            
        const result = await pool.query(query, params);
        return result.rows[0];
    },
    // Tambahkan ke broadcastQueries di db.js
    
    // Additional queries yang diperlukan oleh controller
    
    // Get broadcast lists with search functionality
    getBroadcastListsByUser: async (userId, sessionId, limit = 10, offset = 0, search = '') => {
        const searchQuery = search ? 
            `AND (bl.name ILIKE $5 OR bl.description ILIKE $5)` : '';
        
        const query = `
            SELECT bl.*, 
                   COUNT(bc.id) as contact_count,
                   COUNT(bcm.id) as campaign_count
            FROM broadcast_lists bl
            LEFT JOIN broadcast_contacts bc ON bl.id = bc.broadcast_list_id AND bc.is_active = true
            LEFT JOIN broadcast_campaigns bcm ON bl.id = bcm.broadcast_list_id
            WHERE bl.user_id = $1 AND bl.session_id = $2 AND bl.is_active = true
            ${searchQuery}
            GROUP BY bl.id
            ORDER BY bl.created_at DESC
            LIMIT $3 OFFSET $4
        `;
        
        const params = search ? 
            [userId, sessionId, limit, offset, `%${search}%`] : 
            [userId, sessionId, limit, offset];
            
        const result = await pool.query(query, params);
        return result.rows;
    },
    
    // Get total broadcast lists count
    getTotalBroadcastLists: async (userId, sessionId, search = '') => {
        const searchQuery = search ? 
            `AND (name ILIKE $3 OR description ILIKE $3)` : '';
        
        const query = `
            SELECT COUNT(*) as total 
            FROM broadcast_lists 
            WHERE user_id = $1 AND session_id = $2 AND is_active = true
            ${searchQuery}
        `;
        
        const params = search ? [userId, sessionId, `%${search}%`] : [userId, sessionId];
        const result = await pool.query(query, params);
        return parseInt(result.rows[0].total);
    },
    
    // Get contacts with search functionality
    getContactsInBroadcastList: async (listId, limit = 50, offset = 0, search = '') => {
        const searchQuery = search ? 
            `AND (contact_name ILIKE $4 OR contact_number ILIKE $4)` : '';
        
        const query = `
            SELECT * FROM broadcast_contacts 
            WHERE broadcast_list_id = $1 AND is_active = true
            ${searchQuery}
            ORDER BY contact_name ASC, contact_number ASC
            LIMIT $2 OFFSET $3
        `;
        
        const params = search ? 
            [listId, limit, offset, `%${search}%`] : 
            [listId, limit, offset];
            
        const result = await pool.query(query, params);
        return result.rows;
    },
    
    // Get total contacts count in list
    getTotalContactsInList: async (listId, search = '') => {
        const searchQuery = search ? 
            `AND (contact_name ILIKE $2 OR contact_number ILIKE $2)` : '';
        
        const query = `
            SELECT COUNT(*) as total 
            FROM broadcast_contacts 
            WHERE broadcast_list_id = $1 AND is_active = true
            ${searchQuery}
        `;
        
        const params = search ? [listId, `%${search}%`] : [listId];
        const result = await pool.query(query, params);
        return parseInt(result.rows[0].total);
    },
    
    // Get broadcast campaigns with filtering
    getBroadcastCampaigns: async (userId, sessionId, limit = 10, offset = 0, status = null) => {
        const statusQuery = status ? `AND bc.status = $5` : '';
        
        const query = `
            SELECT bc.*, bl.name as list_name
            FROM broadcast_campaigns bc
            JOIN broadcast_lists bl ON bc.broadcast_list_id = bl.id
            WHERE bc.user_id = $1 AND bc.session_id = $2
            ${statusQuery}
            ORDER BY bc.created_at DESC
            LIMIT $3 OFFSET $4
        `;
        
        const params = status ? 
            [userId, sessionId, limit, offset, status] : 
            [userId, sessionId, limit, offset];
            
        const result = await pool.query(query, params);
        return result.rows;
    },
    
    // Get total broadcast campaigns count
    getTotalBroadcastCampaigns: async (userId, sessionId, status = null) => {
        const statusQuery = status ? `AND status = $3` : '';
        
        const query = `
            SELECT COUNT(*) as total 
            FROM broadcast_campaigns 
            WHERE user_id = $1 AND session_id = $2
            ${statusQuery}
        `;
        
        const params = status ? [userId, sessionId, status] : [userId, sessionId];
        const result = await pool.query(query, params);
        return parseInt(result.rows[0].total);
    },
    
    // Get broadcast overview statistics
    getBroadcastOverviewStats: async (userId, sessionId) => {
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM broadcast_lists WHERE user_id = $1 AND session_id = $2 AND is_active = true) as total_lists,
                (SELECT COUNT(*) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2) as total_campaigns,
                (SELECT COUNT(*) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2 AND status = 'completed') as completed_campaigns,
                (SELECT COUNT(*) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2 AND status = 'sending') as active_campaigns,
                (SELECT COALESCE(SUM(sent_count), 0) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2) as total_sent,
                (SELECT COALESCE(SUM(failed_count), 0) FROM broadcast_campaigns WHERE user_id = $1 AND session_id = $2) as total_failed
        `;
        
        const result = await pool.query(query, [userId, sessionId]);
        return result.rows[0];
    },
    
    // Get campaign by ID with additional validation
    getCampaignById: async (campaignId, userId = null) => {
        const userQuery = userId ? `AND bc.user_id = $2` : '';
        
        const query = `
            SELECT bc.*, bl.name as list_name
            FROM broadcast_campaigns bc
            JOIN broadcast_lists bl ON bc.broadcast_list_id = bl.id
            WHERE bc.id = $1 ${userQuery}
        `;
        
        const params = userId ? [campaignId, userId] : [campaignId];
        const result = await pool.query(query, params);
        return result.rows[0];
    }


};

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🔄 Shutting down gracefully...');
    await pool.end();
    console.log('✅ Database pool closed');
    process.exit(0);
});

module.exports = {
    pool,
    testConnection,
    initDatabase,
    userQueries,
    whatsappSessionQueries,
    broadcastQueries
};