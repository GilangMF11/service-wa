// middleware/broadcastMiddleware.js
const { broadcastQueries } = require('../db');
const clients = require('../clients');

const broadcastMiddleware = {
    // Validate session ownership and status
    validateSession: async (req, res, next) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;

            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    message: 'Session ID is required'
                });
            }

            // Check if session exists and belongs to user
            const session = await req.db.whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (!session) {
                return res.status(404).json({
                    success: false,
                    message: 'Session not found'
                });
            }

            if (session.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this session'
                });
            }

            // Add session info to request
            req.session = session;
            next();
        } catch (error) {
            console.error('Error validating session:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to validate session',
                error: error.message
            });
        }
    },

    // Check if WhatsApp client is ready for broadcasting
    checkClientReady: (req, res, next) => {
        const { sessionId } = req.params;
        
        if (!clients[sessionId] || !clients[sessionId].isReady) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp client is not ready. Please scan QR code first.',
                needScan: true,
                qrCode: clients[sessionId] ? clients[sessionId].qrCode : null
            });
        }

        req.whatsappClient = clients[sessionId].client;
        next();
    },

    // Validate broadcast list ownership
    validateListOwnership: async (req, res, next) => {
        try {
            const { listId } = req.params;
            const userId = req.user.id;

            const list = await broadcastQueries.getBroadcastListById(listId, userId);
            if (!list) {
                return res.status(404).json({
                    success: false,
                    message: 'Broadcast list not found'
                });
            }

            req.broadcastList = list;
            next();
        } catch (error) {
            console.error('Error validating list ownership:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to validate list ownership',
                error: error.message
            });
        }
    },

    // Validate campaign ownership
    validateCampaignOwnership: async (req, res, next) => {
        try {
            const { campaignId } = req.params;
            const userId = req.user.id;

            const campaign = await broadcastQueries.getCampaignById(campaignId, userId);
            if (!campaign) {
                return res.status(404).json({
                    success: false,
                    message: 'Campaign not found'
                });
            }

            req.campaign = campaign;
            next();
        } catch (error) {
            console.error('Error validating campaign ownership:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to validate campaign ownership',
                error: error.message
            });
        }
    },

    // Rate limiting for broadcast operations
    broadcastRateLimit: (req, res, next) => {
        const userId = req.user.id;
        const now = Date.now();
        const windowMs = 60000; // 1 minute
        const maxRequests = 10; // Max 10 broadcast operations per minute

        if (!broadcastMiddleware.rateLimitStore) {
            broadcastMiddleware.rateLimitStore = new Map();
        }

        const userKey = `broadcast_${userId}`;
        const userRequests = broadcastMiddleware.rateLimitStore.get(userKey) || { count: 0, resetTime: now + windowMs };

        if (now > userRequests.resetTime) {
            userRequests.count = 1;
            userRequests.resetTime = now + windowMs;
        } else {
            userRequests.count++;
        }

        broadcastMiddleware.rateLimitStore.set(userKey, userRequests);

        if (userRequests.count > maxRequests) {
            return res.status(429).json({
                success: false,
                message: 'Too many broadcast requests. Please wait before trying again.',
                retryAfter: Math.ceil((userRequests.resetTime - now) / 1000)
            });
        }

        next();
    },

    // Validate contact data format
    validateContactData: (req, res, next) => {
        const { contacts } = req.body;

        if (!contacts || !Array.isArray(contacts)) {
            return res.status(400).json({
                success: false,
                message: 'Contacts must be provided as an array'
            });
        }

        if (contacts.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'At least one contact is required'
            });
        }

        // Validate each contact format
        const invalidContacts = [];
        const validContacts = contacts.filter((contact, index) => {
            if (!contact.number) {
                invalidContacts.push({ index, reason: 'Missing number' });
                return false;
            }

            const cleanNumber = contact.number.toString().replace(/\D/g, '');
            if (cleanNumber.length < 10) {
                invalidContacts.push({ index, reason: 'Invalid number format' });
                return false;
            }

            return true;
        });

        if (validContacts.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid contacts found',
                errors: invalidContacts
            });
        }

        // Add cleaned contacts to request
        req.validContacts = validContacts.map(contact => ({
            number: contact.number.toString().replace(/\D/g, ''),
            name: contact.name ? contact.name.trim() : contact.number.toString()
        }));

        if (invalidContacts.length > 0) {
            req.invalidContacts = invalidContacts;
        }

        next();
    },

    // Validate broadcast message content
    validateMessageContent: (req, res, next) => {
        const { messageContent, messageType = 'text' } = req.body;

        if (!messageContent || messageContent.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Message content is required'
            });
        }

        if (messageContent.length > 4096) {
            return res.status(400).json({
                success: false,
                message: 'Message content too long. Maximum 4096 characters allowed'
            });
        }

        // Validate message type
        const allowedTypes = ['text', 'image', 'document'];
        if (!allowedTypes.includes(messageType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid message type. Allowed types: ${allowedTypes.join(', ')}`
            });
        }

        next();
    }
};

module.exports = broadcastMiddleware;