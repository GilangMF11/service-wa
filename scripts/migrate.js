// scripts/migrate.js
require('dotenv').config();
const { pool, testConnection, initDatabase } = require('../db');

const runMigrations = async () => {
    console.log('🚀 Starting database migration...');
    
    try {
        // Test connection first
        const connected = await testConnection();
        if (!connected) {
            console.error('❌ Database connection failed. Migration aborted.');
            process.exit(1);
        }

        // Run initialization
        const initialized = await initDatabase();
        if (!initialized) {
            console.error('❌ Database initialization failed. Migration aborted.');
            process.exit(1);
        }

        // Additional migrations can be added here
        await runAdditionalMigrations();

        console.log('✅ Database migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
        console.log('🔄 Database connection closed.');
    }
};

const runAdditionalMigrations = async () => {
    console.log('📋 Running additional migrations...');
    
    try {
        // Migration 1: Add indexes if not exists
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_username_active 
            ON users(username) WHERE is_active = true;
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_email_active 
            ON users(email) WHERE is_active = true;
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_user_session 
            ON broadcast_campaigns(user_id, session_id);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_created_at 
            ON broadcast_campaigns(created_at DESC);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_broadcast_messages_contact 
            ON broadcast_messages(contact_number);
        `);

        console.log('✅ Additional indexes created');

        // Migration 2: Add default admin user if not exists
        const adminExists = await pool.query(`
            SELECT id FROM users WHERE username = 'admin' AND is_active = true
        `);

        if (adminExists.rows.length === 0) {
            const bcrypt = require('bcrypt');
            const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);

            await pool.query(`
                INSERT INTO users (username, password, email, role) 
                VALUES ('admin', $1, 'admin@whatsapp-api.com', 'admin')
                ON CONFLICT (username) DO NOTHING
            `, [hashedPassword]);

            console.log('✅ Default admin user created');
            console.log(`   Username: admin`);
            console.log(`   Password: ${defaultPassword}`);
            console.log('   ⚠️  Please change the default password after first login!');
        } else {
            console.log('ℹ️  Admin user already exists');
        }

        // Migration 3: Add sample data for development
        if (process.env.NODE_ENV === 'development' && process.env.SEED_DATABASE === 'true') {
            await seedDevelopmentData();
        }

    } catch (error) {
        console.error('❌ Additional migrations failed:', error.message);
        throw error;
    }
};

const seedDevelopmentData = async () => {
    console.log('🌱 Seeding development data...');
    
    try {
        // Create test user
        const bcrypt = require('bcrypt');
        const testPassword = await bcrypt.hash('test123', 10);

        await pool.query(`
            INSERT INTO users (username, password, email, role) 
            VALUES ('testuser', $1, 'test@example.com', 'user')
            ON CONFLICT (username) DO NOTHING
        `, [testPassword]);

        // Get test user ID
        const testUser = await pool.query(`
            SELECT id FROM users WHERE username = 'testuser'
        `);

        if (testUser.rows.length > 0) {
            const userId = testUser.rows[0].id;
            const sessionId = 'test-session-123';

            // Create test session
            await pool.query(`
                INSERT INTO whatsapp_sessions (user_id, session_id, description, is_active) 
                VALUES ($1, $2, 'Test Session for Development', false)
                ON CONFLICT (session_id) DO NOTHING
            `, [userId, sessionId]);

            // Create test broadcast list
            const broadcastListResult = await pool.query(`
                INSERT INTO broadcast_lists (user_id, session_id, name, description) 
                VALUES ($1, $2, 'Test Broadcast List', 'Sample broadcast list for testing')
                ON CONFLICT DO NOTHING
                RETURNING id
            `, [userId, sessionId]);

            if (broadcastListResult.rows.length > 0) {
                const listId = broadcastListResult.rows[0].id;

                // Add test contacts
                const testContacts = [
                    { number: '628123456789', name: 'John Doe' },
                    { number: '628987654321', name: 'Jane Smith' },
                    { number: '628555666777', name: 'Bob Johnson' }
                ];

                for (const contact of testContacts) {
                    await pool.query(`
                        INSERT INTO broadcast_contacts (broadcast_list_id, contact_number, contact_name) 
                        VALUES ($1, $2, $3)
                        ON CONFLICT (broadcast_list_id, contact_number) DO NOTHING
                    `, [listId, contact.number, contact.name]);
                }

                console.log('✅ Test data seeded successfully');
            }
        }

    } catch (error) {
        console.error('❌ Seeding failed:', error.message);
        // Don't throw error for seeding failures in development
    }
};

// Handle script execution
if (require.main === module) {
    runMigrations();
}

module.exports = {
    runMigrations,
    runAdditionalMigrations,
    seedDevelopmentData
};