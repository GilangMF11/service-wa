// models/userQueries.js
const { pool } = require('../db');

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

module.exports = userQueries;
