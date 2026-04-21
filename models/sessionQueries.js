// models/sessionQueries.js
const { pool } = require('../db');

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

    // Memperbarui QR code dan status koneksi
    updateSessionConnection: async (sessionId, qrCode, isConnected, phoneNumber = null) => {
        const query = `
            UPDATE whatsapp_sessions 
            SET 
                session_data = COALESCE(session_data, '{}')::jsonb || $1::jsonb,
                is_active = $2,
                updated_at = NOW() 
            WHERE session_id = $3
            RETURNING *
        `;
        const sessionData = {
            qrCode: qrCode,
            isConnected: isConnected,
            phoneNumber: phoneNumber,
            lastConnectionUpdate: new Date().toISOString()
        };
        const result = await pool.query(query, [JSON.stringify(sessionData), isConnected, sessionId]);
        return result.rows[0];
    },

    // Mendapatkan session dengan data koneksi
    getSessionWithConnection: async (sessionId) => {
        const query = `
            SELECT *, 
                   COALESCE(session_data->>'qrCode', '') as qr_code,
                   COALESCE((session_data->>'isConnected')::boolean, false) as is_connected,
                   COALESCE(session_data->>'phoneNumber', '') as phone_number
            FROM whatsapp_sessions 
            WHERE session_id = $1
        `;
        const result = await pool.query(query, [sessionId]);
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
    },

    // Update session last activity
    updateSessionActivity: async (sessionId) => {
        const query = 'UPDATE whatsapp_sessions SET updated_at = NOW() WHERE session_id = $1 RETURNING *';
        const result = await pool.query(query, [sessionId]);
        return result.rows[0];
    }
};

module.exports = whatsappSessionQueries;
