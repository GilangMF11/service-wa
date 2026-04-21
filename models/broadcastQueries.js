// models/broadcastQueries.js
const { pool } = require('../db');

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
    getBroadcastListsByUser: async (userId, sessionId, limit = 10, offset = 0, search = '') => {
        const searchQuery = search ? 
            `AND (bl.name ILIKE $5 OR bl.description ILIKE $5)` : '';
        
        const query = `
            SELECT bl.*, 
                   COALESCE(contact_counts.contact_count, 0) as contact_count,
                   COALESCE(campaign_counts.campaign_count, 0) as campaign_count
            FROM broadcast_lists bl
            LEFT JOIN (
                SELECT broadcast_list_id, COUNT(*) as contact_count
                FROM broadcast_contacts 
                WHERE is_active = true
                GROUP BY broadcast_list_id
            ) contact_counts ON bl.id = contact_counts.broadcast_list_id
            LEFT JOIN (
                SELECT broadcast_list_id, COUNT(*) as campaign_count
                FROM broadcast_campaigns 
                GROUP BY broadcast_list_id
            ) campaign_counts ON bl.id = campaign_counts.broadcast_list_id
            WHERE bl.user_id = $1 AND bl.session_id = $2 AND bl.is_active = true
            ${searchQuery}
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

    // Get broadcast list by ID
    getBroadcastListById: async (listId, userId) => {
        const query = `
            SELECT bl.*, 
                   (SELECT COUNT(*) FROM broadcast_contacts bc WHERE bc.broadcast_list_id = bl.id AND bc.is_active = true) as contact_count
            FROM broadcast_lists bl
            WHERE bl.id = $1 AND bl.user_id = $2 AND bl.is_active = true
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

        // Remove duplicates based on contact number
        const uniqueContacts = contacts.filter((contact, index, self) => 
            index === self.findIndex(c => c.number === contact.number)
        );

        const values = uniqueContacts.map((_, index) =>
            `($1, $${index * 2 + 2}, $${index * 2 + 3})`
        ).join(', ');

        const params = [listId];
        uniqueContacts.forEach(contact => {
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
            SELECT COUNT(DISTINCT contact_number) as total 
            FROM broadcast_contacts 
            WHERE broadcast_list_id = $1 AND is_active = true
            ${searchQuery}
        `;
        
        const params = search ? [listId, `%${search}%`] : [listId];
        const result = await pool.query(query, params);
        return parseInt(result.rows[0].total);
    },

    // Get accurate contact count for a specific list
    getAccurateContactCount: async (listId) => {
        const query = `
            SELECT COUNT(DISTINCT contact_number) as total 
            FROM broadcast_contacts 
            WHERE broadcast_list_id = $1 AND is_active = true
        `;
        
        const result = await pool.query(query, [listId]);
        return parseInt(result.rows[0].total);
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

    // Get campaign by ID
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

    // Get pending messages for a campaign
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

    // DASHBOARD QUERIES
    getAllCampaigns: async () => {
        const query = `
            SELECT 
                bc.id, bc.campaign_name as name, bc.status, bc.created_at, bc.sent_count, bc.failed_count, bl.name as list_name
            FROM broadcast_campaigns bc
            LEFT JOIN broadcast_lists bl ON bc.broadcast_list_id = bl.id
            ORDER BY bc.created_at DESC
        `;
        const result = await pool.query(query);
        return result.rows;
    },

    getAllBroadcastLists: async () => {
        const query = `
            SELECT 
                bl.id, bl.name, bl.description, bl.created_at, bl.is_active, COUNT(bc.id) as contact_count
            FROM broadcast_lists bl
            LEFT JOIN broadcast_contacts bc ON bl.id = bc.broadcast_list_id AND bc.is_active = true
            WHERE bl.is_active = true
            GROUP BY bl.id
            ORDER BY bl.created_at DESC
        `;
        const result = await pool.query(query);
        return result.rows;
    }
};

module.exports = broadcastQueries;
