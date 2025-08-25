// controllers/api/broadcastController.js
const { broadcastQueries } = require('../../db');
const clients = require('../../clients');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { config } = require('../../config/config');
const { MessageMedia } = require('whatsapp-web.js');

// Setup multer untuk upload media
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '../../uploads/broadcast');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, `broadcast-${uniqueSuffix}${extension}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: config.upload.maxSize
    },
    fileFilter: function (req, file, cb) {
        const allowedMimes = config.upload.allowedTypes;
        
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: ${allowedMimes.join(', ')}`), false);
        }
    }
});

const broadcastController = {
    // === BROADCAST LISTS MANAGEMENT ===
    
    // GET /api/whatsapp/:sessionId/broadcast/lists
    getBroadcastLists: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const search = req.query.search || '';
            const offset = (page - 1) * limit;

            // Validate session ownership
            const session = await req.db.whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (!session || session.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this session'
                });
            }

            const lists = await broadcastQueries.getBroadcastListsByUser(userId, sessionId, limit, offset, search);
            const totalLists = await broadcastQueries.getTotalBroadcastLists(userId, sessionId, search);
            const totalPages = Math.ceil(totalLists / limit);
            
            res.status(200).json({
                success: true,
                data: {
                    lists,
                    pagination: {
                        currentPage: page,
                        totalPages,
                        totalItems: totalLists,
                        hasNextPage: page < totalPages,
                        hasPrevPage: page > 1
                    }
                }
            });
        } catch (error) {
            console.error('Error getting broadcast lists:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get broadcast lists',
                error: error.message
            });
        }
    },

    // POST /api/whatsapp/:sessionId/broadcast/lists
    createBroadcastList: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;
            const { name, description, contacts } = req.body;

            // Validation
            if (!name || name.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Broadcast list name is required'
                });
            }

            if (name.length > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Broadcast list name too long (max 100 characters)'
                });
            }

            // Validate session ownership
            const session = await req.db.whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (!session || session.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this session'
                });
            }

            // Create broadcast list
            const list = await broadcastQueries.createBroadcastList(userId, sessionId, name.trim(), description?.trim());

            // Add contacts if provided
            if (contacts && Array.isArray(contacts) && contacts.length > 0) {
                // Validate contacts format
                const validContacts = contacts.filter(contact => {
                    const number = contact.number?.toString().replace(/\D/g, '');
                    return number && number.length >= 10;
                }).map(contact => ({
                    number: contact.number.toString().replace(/\D/g, ''),
                    name: contact.name?.trim() || contact.number.toString()
                }));

                if (validContacts.length > 0) {
                    await broadcastQueries.addMultipleContactsToBroadcastList(list.id, validContacts);
                }
            }

            // Get updated list with contact count
            const updatedList = await broadcastQueries.getBroadcastListById(list.id, userId);

            res.status(201).json({
                success: true,
                message: 'Broadcast list created successfully',
                data: updatedList
            });
        } catch (error) {
            console.error('Error creating broadcast list:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create broadcast list',
                error: error.message
            });
        }
    },

    // GET /api/whatsapp/:sessionId/broadcast/lists/:listId
    getBroadcastListDetails: async (req, res) => {
        try {
            const { sessionId, listId } = req.params;
            const userId = req.user.id;

            const list = await broadcastQueries.getBroadcastListById(listId, userId);
            if (!list) {
                return res.status(404).json({
                    success: false,
                    message: 'Broadcast list not found'
                });
            }

            res.status(200).json({
                success: true,
                data: list
            });
        } catch (error) {
            console.error('Error getting broadcast list details:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get broadcast list details',
                error: error.message
            });
        }
    },

    // PUT /api/whatsapp/:sessionId/broadcast/lists/:listId
    updateBroadcastList: async (req, res) => {
        try {
            const { sessionId, listId } = req.params;
            const userId = req.user.id;
            const { name, description } = req.body;

            if (!name || name.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Broadcast list name is required'
                });
            }

            const updatedList = await broadcastQueries.updateBroadcastList(listId, userId, name.trim(), description?.trim());

            if (!updatedList) {
                return res.status(404).json({
                    success: false,
                    message: 'Broadcast list not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Broadcast list updated successfully',
                data: updatedList
            });
        } catch (error) {
            console.error('Error updating broadcast list:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update broadcast list',
                error: error.message
            });
        }
    },

    // DELETE /api/whatsapp/:sessionId/broadcast/lists/:listId
    deleteBroadcastList: async (req, res) => {
        try {
            const { sessionId, listId } = req.params;
            const userId = req.user.id;

            // Verify session ownership
            const session = await req.db.whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (!session || session.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this session'
                });
            }

            // Check if list exists and belongs to user
            const list = await broadcastQueries.getBroadcastListById(listId, userId);
            if (!list) {
                return res.status(404).json({
                    success: false,
                    message: 'Broadcast list not found'
                });
            }

            // Check if list has active campaigns
            const activeCampaigns = await broadcastQueries.getActiveCampaignsByList(listId);
            if (activeCampaigns.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete list with active campaigns. Please stop all campaigns first.'
                });
            }

            // Delete the list (soft delete)
            const deleted = await broadcastQueries.deleteBroadcastList(listId, userId);

            if (!deleted) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to delete broadcast list'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Broadcast list deleted successfully',
                data: {
                    listId: listId,
                    listName: list.name
                }
            });
        } catch (error) {
            console.error('Error deleting broadcast list:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete broadcast list',
                error: error.message
            });
        }
    },

    // === BROADCAST CONTACTS MANAGEMENT ===
    
    // GET /api/whatsapp/:sessionId/broadcast/lists/:listId/contact-count
    getBroadcastListContactCount: async (req, res) => {
        try {
            const { listId } = req.params;
            const userId = req.user.id;

            // Verify list ownership
            const list = await broadcastQueries.getBroadcastListById(listId, userId);
            if (!list) {
                return res.status(404).json({
                    success: false,
                    message: 'Broadcast list not found'
                });
            }

            // Get accurate contact count
            const contactCount = await broadcastQueries.getAccurateContactCount(listId);

            res.status(200).json({
                success: true,
                data: {
                    listId: listId,
                    contactCount: contactCount
                }
            });
        } catch (error) {
            console.error('Error getting contact count:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get contact count',
                error: error.message
            });
        }
    },

    // GET /api/whatsapp/:sessionId/broadcast/lists/:listId/contacts
    getBroadcastContacts: async (req, res) => {
        try {
            const { listId } = req.params;
            const userId = req.user.id;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const search = req.query.search || '';
            const offset = (page - 1) * limit;

            // Verify list ownership
            const list = await broadcastQueries.getBroadcastListById(listId, userId);
            if (!list) {
                return res.status(404).json({
                    success: false,
                    message: 'Broadcast list not found'
                });
            }

            const contacts = await broadcastQueries.getContactsInBroadcastList(listId, limit, offset, search);
            const totalContacts = await broadcastQueries.getTotalContactsInList(listId, search);
            const totalPages = Math.ceil(totalContacts / limit);
            
            res.status(200).json({
                success: true,
                data: {
                    contacts,
                    pagination: {
                        currentPage: page,
                        totalPages,
                        totalItems: totalContacts,
                        hasNextPage: page < totalPages,
                        hasPrevPage: page > 1
                    }
                }
            });
        } catch (error) {
            console.error('Error getting broadcast contacts:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get broadcast contacts',
                error: error.message
            });
        }
    },

    // POST /api/whatsapp/:sessionId/broadcast/lists/:listId/contacts
    addBroadcastContacts: async (req, res) => {
        try {
            const { listId } = req.params;
            const userId = req.user.id;
            const { contacts } = req.body;

            if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Contacts array is required and must not be empty'
                });
            }

            // Verify list ownership
            const list = await broadcastQueries.getBroadcastListById(listId, userId);
            if (!list) {
                return res.status(404).json({
                    success: false,
                    message: 'Broadcast list not found'
                });
            }

            // Validate and clean contacts
            const validContacts = contacts.filter(contact => {
                const number = contact.number?.toString().replace(/\D/g, '');
                return number && number.length >= 10;
            }).map(contact => ({
                number: contact.number.toString().replace(/\D/g, ''),
                name: contact.name?.trim() || contact.number.toString()
            }));

            if (validContacts.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No valid contacts provided'
                });
            }

            // Check batch size limit
            if (validContacts.length > config.broadcast.maxBatchSize) {
                return res.status(400).json({
                    success: false,
                    message: `Too many contacts. Maximum ${config.broadcast.maxBatchSize} contacts allowed per batch`
                });
            }

            const addedContacts = await broadcastQueries.addMultipleContactsToBroadcastList(listId, validContacts);

            res.status(201).json({
                success: true,
                message: `${addedContacts.length} contacts added successfully`,
                data: {
                    added: addedContacts.length,
                    total: validContacts.length,
                    contacts: addedContacts
                }
            });
        } catch (error) {
            console.error('Error adding broadcast contacts:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add contacts',
                error: error.message
            });
        }
    },

    // DELETE /api/whatsapp/:sessionId/broadcast/lists/:listId/contacts/:contactNumber
    removeBroadcastContact: async (req, res) => {
        try {
            const { listId, contactNumber } = req.params;
            const userId = req.user.id;

            // Verify list ownership
            const list = await broadcastQueries.getBroadcastListById(listId, userId);
            if (!list) {
                return res.status(404).json({
                    success: false,
                    message: 'Broadcast list not found'
                });
            }

            const cleanNumber = contactNumber.replace(/\D/g, '');
            const removed = await broadcastQueries.removeContactFromBroadcastList(listId, cleanNumber);

            if (!removed) {
                return res.status(404).json({
                    success: false,
                    message: 'Contact not found in broadcast list'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Contact removed successfully'
            });
        } catch (error) {
            console.error('Error removing broadcast contact:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to remove contact',
                error: error.message
            });
        }
    },

    // === BROADCAST CAMPAIGNS MANAGEMENT ===
    
    // GET /api/whatsapp/:sessionId/broadcast/campaigns
    getBroadcastCampaigns: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const status = req.query.status;
            const offset = (page - 1) * limit;

            const campaigns = await broadcastQueries.getBroadcastCampaigns(userId, sessionId, limit, offset, status);
            const totalCampaigns = await broadcastQueries.getTotalBroadcastCampaigns(userId, sessionId, status);
            const totalPages = Math.ceil(totalCampaigns / limit);
            
            res.status(200).json({
                success: true,
                data: {
                    campaigns,
                    pagination: {
                        currentPage: page,
                        totalPages,
                        totalItems: totalCampaigns,
                        hasNextPage: page < totalPages,
                        hasPrevPage: page > 1
                    }
                }
            });
        } catch (error) {
            console.error('Error getting broadcast campaigns:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get broadcast campaigns',
                error: error.message
            });
        }
    },

    // POST /api/whatsapp/:sessionId/broadcast/send
    sendBroadcast: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;
            const { 
                listId, 
                campaignName, 
                messageType = 'text', 
                messageContent, 
                mediaUrl,
                mediaFilename,
                delay = config.broadcast.defaultDelay 
            } = req.body;

            // Validation
            if (!listId || !campaignName || !messageContent) {
                return res.status(400).json({
                    success: false,
                    message: 'listId, campaignName, and messageContent are required'
                });
            }

            // Validate delay
            const delayMs = Math.max(config.broadcast.minDelay, Math.min(delay, config.broadcast.maxDelay));

            // Check if WhatsApp client is ready
            if (!clients[sessionId]) {
                return res.status(503).json({
                    success: false,
                    message: 'WhatsApp client not found for this session. Please reconnect.',
                    needScan: true
                });
            }
            
            // Check if client is ready, if not try to wait a bit
            if (!clients[sessionId].isReady) {
                // Try to wait for client to be ready (max 5 seconds)
                let attempts = 0;
                const maxAttempts = 10;
                
                while (!clients[sessionId].isReady && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    attempts++;
                }
                
                if (!clients[sessionId].isReady) {
                    return res.status(503).json({
                        success: false,
                        message: 'WhatsApp client is not ready. Please scan QR code first.',
                        needScan: true,
                        qrCode: clients[sessionId].qrCode
                    });
                }
            }

            // Verify session ownership
            const session = await req.db.whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (!session || session.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this session'
                });
            }

            // Get broadcast list and contacts
            const broadcastList = await broadcastQueries.getBroadcastListById(listId, userId);
            if (!broadcastList) {
                return res.status(404).json({
                    success: false,
                    message: 'Broadcast list not found'
                });
            }

            // Get unique contacts from broadcast list
            const contacts = await broadcastQueries.getContactsInBroadcastList(listId, 10000, 0); // Get all contacts
            
            // Remove duplicates if any
            const uniqueContacts = contacts.filter((contact, index, self) => 
                index === self.findIndex(c => c.contact_number === contact.contact_number)
            );
            
            if (uniqueContacts.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No contacts found in broadcast list'
                });
            }

            // Log if duplicates were found and removed
            if (contacts.length !== uniqueContacts.length) {
                console.log(`⚠️ Removed ${contacts.length - uniqueContacts.length} duplicate contacts from list ${listId}`);
            }

            // Create campaign
            const campaign = await broadcastQueries.createBroadcastCampaign(
                listId, userId, sessionId, campaignName, messageType, 
                messageContent, mediaUrl, mediaFilename, uniqueContacts.length, delayMs
            );

            // Create message records with unique contacts
            await broadcastQueries.createBroadcastMessages(campaign.id, uniqueContacts);

            // Start broadcast in background
            res.status(200).json({
                success: true,
                message: 'Broadcast started successfully',
                data: {
                    campaignId: campaign.id,
                    totalContacts: uniqueContacts.length,
                    estimatedDuration: Math.ceil((uniqueContacts.length * delayMs) / 1000 / 60) // minutes
                }
            });

            // Process broadcast in background with error handling
            setImmediate(async () => {
                try {
                    await processBroadcastSending(sessionId, campaign.id, uniqueContacts, messageContent, delayMs, messageType, mediaUrl);
                } catch (error) {
                    console.error(`❌ Background broadcast error for campaign ${campaign.id}:`, error);
                    await broadcastQueries.updateCampaignStatus(campaign.id, 'failed', null, new Date());
                }
            });

        } catch (error) {
            console.error('Error sending broadcast:', error);
            
            // Check if it's a database constraint error
            if (error.code === '42P10') {
                res.status(500).json({
                    success: false,
                    message: 'Database constraint error. Please try again.',
                    error: 'Database error'
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Failed to send broadcast',
                    error: error.message
                });
            }
        }
    },

    // GET /api/whatsapp/:sessionId/broadcast/campaigns/:campaignId
    getCampaignDetails: async (req, res) => {
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

            const statistics = await broadcastQueries.getBroadcastStatistics(campaignId);
            const messages = await broadcastQueries.getBroadcastMessagesByCampaign(campaignId, 100, 0);

            res.status(200).json({
                success: true,
                data: {
                    campaign,
                    statistics,
                    messages: messages.map(msg => ({
                        ...msg,
                        // Don't expose sensitive error details to frontend
                        error_message: msg.error_message ? 'Failed to send' : null
                    }))
                }
            });
        } catch (error) {
            console.error('Error getting campaign details:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get campaign details',
                error: error.message
            });
        }
    },

    // POST /api/whatsapp/:sessionId/broadcast/campaigns/:campaignId/pause
    pauseCampaign: async (req, res) => {
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

            if (campaign.status !== 'sending') {
                return res.status(400).json({
                    success: false,
                    message: 'Campaign is not currently sending'
                });
            }

            await broadcastQueries.updateCampaignStatus(campaignId, 'paused');

            res.status(200).json({
                success: true,
                message: 'Campaign paused successfully'
            });
        } catch (error) {
            console.error('Error pausing campaign:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to pause campaign',
                error: error.message
            });
        }
    },

    // === UTILITY FUNCTIONS ===
    
    // GET /api/whatsapp/:sessionId/broadcast/check-client
    checkClientStatus: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;

            // Verify session ownership
            const session = await req.db.whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (!session || session.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this session'
                });
            }

            const client = clients[sessionId];
            
            if (!client) {
                return res.status(404).json({
                    success: false,
                    message: 'WhatsApp client not found',
                    data: {
                        isReady: false,
                        hasClient: false,
                        qrCode: null
                    }
                });
            }

            // Additional client validation
            let isActuallyReady = client.isReady;
            
            // Check if client is actually ready by testing the connection
            if (client.isReady && client.client) {
                try {
                    // Try to get client info to verify it's actually connected
                    const clientInfo = client.client.info;
                    isActuallyReady = !!clientInfo;
                } catch (error) {
                    console.warn(`Client connection test failed for session ${sessionId}:`, error.message);
                    isActuallyReady = false;
                }
            }

            // Log debug info
            console.log(`🔍 Client status check for session ${sessionId}:`, {
                reportedReady: client.isReady,
                actuallyReady: isActuallyReady,
                hasClient: !!client,
                hasClientProperty: !!client.client,
                clientType: typeof client.client,
                clientObjectKeys: client.client ? Object.keys(client.client) : 'N/A'
            });

            res.status(200).json({
                success: true,
                message: 'Client status retrieved successfully',
                data: {
                    isReady: isActuallyReady,
                    hasClient: true,
                    qrCode: client.qrCode,
                    createdAt: client.createdAt,
                    description: client.description,
                    debug: {
                        reportedReady: client.isReady,
                        actuallyReady: isActuallyReady,
                        hasClientObject: !!client.client
                    }
                }
            });
        } catch (error) {
            console.error('Error checking client status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check client status',
                error: error.message
            });
        }
    },
    
    // POST /api/whatsapp/:sessionId/broadcast/reconnect-client
    reconnectClient: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;

            // Verify session ownership
            const session = await req.db.whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (!session || session.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this session'
                });
            }

            const client = clients[sessionId];
            
            if (!client) {
                return res.status(404).json({
                    success: false,
                    message: 'WhatsApp client not found'
                });
            }

            // Try to reconnect the client
            try {
                if (client.client) {
                    // Reset client status
                    client.isReady = false;
                    
                    // Try to reinitialize
                    await client.client.initialize();
                    
                    // Wait a bit for the client to be ready
                    let attempts = 0;
                    const maxAttempts = 10;
                    
                    while (!client.isReady && attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        attempts++;
                    }
                    
                    res.status(200).json({
                        success: true,
                        message: client.isReady ? 'Client reconnected successfully' : 'Client reconnection initiated',
                        data: {
                            isReady: client.isReady,
                            attempts: attempts
                        }
                    });
                } else {
                    res.status(400).json({
                        success: false,
                        message: 'Client object not available'
                    });
                }
            } catch (error) {
                console.error(`Error reconnecting client for session ${sessionId}:`, error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to reconnect client',
                    error: error.message
                });
            }
        } catch (error) {
            console.error('Error reconnecting client:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to reconnect client',
                error: error.message
            });
        }
    },

    // POST /api/whatsapp/:sessionId/broadcast/fix-client-status
    fixClientStatus: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;

            // Verify session ownership
            const session = await req.db.whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (!session || session.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this session'
                });
            }

            const client = clients[sessionId];
            
            if (!client) {
                return res.status(404).json({
                    success: false,
                    message: 'WhatsApp client not found'
                });
            }

            // Fix undefined isReady status
            if (client.isReady === undefined) {
                console.log(`🔧 Fixing undefined isReady status for session ${sessionId}`);
                
                // Check if client is actually ready by testing connection
                let isActuallyReady = false;
                if (client.client) {
                    try {
                        const clientInfo = client.client.info;
                        isActuallyReady = !!clientInfo;
                    } catch (error) {
                        console.warn(`Client connection test failed: ${error.message}`);
                        isActuallyReady = false;
                    }
                }
                
                // Update the status
                client.isReady = isActuallyReady;
                
                res.status(200).json({
                    success: true,
                    message: 'Client status fixed',
                    data: {
                        isReady: client.isReady,
                        wasUndefined: true,
                        fixed: true
                    }
                });
            } else {
                res.status(200).json({
                    success: true,
                    message: 'Client status is already defined',
                    data: {
                        isReady: client.isReady,
                        wasUndefined: false,
                        fixed: false
                    }
                });
            }
        } catch (error) {
            console.error('Error fixing client status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fix client status',
                error: error.message
            });
        }
    },

    // POST /api/whatsapp/:sessionId/broadcast/fix-client-structure
    fixClientStructure: async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;

            // Verify session ownership
            const session = await req.db.whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (!session || session.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this session'
                });
            }

            const client = clients[sessionId];
            
            if (!client) {
                return res.status(404).json({
                    success: false,
                    message: 'WhatsApp client not found'
                });
            }

            // Check if client structure is correct
            console.log(`🔧 Checking client structure for session ${sessionId}:`, {
                hasClient: !!client,
                hasClientProperty: !!client.client,
                clientType: typeof client.client,
                clientKeys: Object.keys(client || {}),
                clientObjectKeys: client.client ? Object.keys(client.client) : 'N/A'
            });

            // If client.client is undefined, try to fix it
            if (!client.client) {
                console.log(`🔧 Client.client is undefined, attempting to fix structure`);
                
                // Check if the client object itself is the WhatsApp client
                if (client.info) {
                    console.log(`🔧 Found client.info, client object is the actual WhatsApp client`);
                    // The client object itself is the WhatsApp client
                    client.client = client;
                    client.isReady = true;
                } else {
                    console.log(`🔧 No client.info found, cannot fix structure`);
                    res.status(400).json({
                        success: false,
                        message: 'Cannot fix client structure - no valid client found'
                    });
                    return;
                }
            }

            res.status(200).json({
                success: true,
                message: 'Client structure checked/fixed',
                data: {
                    hasClient: !!client,
                    hasClientProperty: !!client.client,
                    isReady: client.isReady,
                    fixed: true
                }
            });
        } catch (error) {
            console.error('Error fixing client structure:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fix client structure',
                error: error.message
            });
        }
    },

    // POST /api/whatsapp/:sessionId/broadcast/lists/:listId/clean-duplicates
    cleanDuplicateContacts: async (req, res) => {
        try {
            const { sessionId, listId } = req.params;
            const userId = req.user.id;

            // Verify session ownership
            const session = await req.db.whatsappSessionQueries.getSessionBySessionId(sessionId);
            if (!session || session.user_id !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied to this session'
                });
            }

            // Check if list exists and belongs to user
            const list = await broadcastQueries.getBroadcastListById(listId, userId);
            if (!list) {
                return res.status(404).json({
                    success: false,
                    message: 'Broadcast list not found'
                });
            }

            // Clean duplicate contacts
            const removedCount = await broadcastQueries.cleanDuplicateContacts(listId);

            res.status(200).json({
                success: true,
                message: `Successfully cleaned ${removedCount} duplicate contacts`,
                data: {
                    listId: listId,
                    removedCount: removedCount
                }
            });
        } catch (error) {
            console.error('Error cleaning duplicate contacts:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to clean duplicate contacts',
                error: error.message
            });
        }
    },

    // === MEDIA UPLOAD ===
    uploadMedia: upload.single('media')
};

// Background process untuk mengirim broadcast
const processBroadcastSending = async (sessionId, campaignId, contacts, messageContent, delay, messageType = 'text', mediaUrl = null) => {
    try {
        console.log(`📢 Starting broadcast campaign ${campaignId} for ${contacts.length} contacts`);
        console.log(`📱 Using WhatsApp Web JS version: ${require('whatsapp-web.js/package.json').version}`);
        
        await broadcastQueries.updateCampaignStatus(campaignId, 'sending', new Date());
        
        let sentCount = 0;
        let failedCount = 0;
        const client = clients[sessionId].client;
        
        // Validate client is ready
        if (!client) {
            console.error(`❌ WhatsApp client not found for session ${sessionId}`);
            await broadcastQueries.updateCampaignStatus(campaignId, 'failed', null, new Date());
            return;
        }
        
        // Auto-fix undefined isReady status and client structure
        if (client.isReady === undefined || !client.client) {
            console.log(`🔧 Auto-fixing client issues for session ${sessionId}`);
            
            // Check if client structure is wrong (client.client is undefined)
            if (!client.client) {
                console.log(`🔧 Client.client is undefined, checking if client object itself is the WhatsApp client`);
                
                // Check if the client object itself is the WhatsApp client
                if (client.info) {
                    console.log(`🔧 Found client.info, client object is the actual WhatsApp client`);
                    // The client object itself is the WhatsApp client
                    client.client = client;
                    client.isReady = true;
                    console.log(`🔧 Fixed client structure and set isReady to true`);
                } else {
                    console.log(`🔧 No client.info found, cannot fix structure`);
                    client.isReady = false;
                }
            } else {
                // Fix undefined isReady status
                console.log(`🔧 Auto-fixing undefined isReady status for session ${sessionId}`);
                
                // Check if client is actually ready by testing connection
                let isActuallyReady = false;
                if (client.client) {
                    try {
                        const clientInfo = client.client.info;
                        isActuallyReady = !!clientInfo;
                    } catch (error) {
                        console.warn(`Client connection test failed: ${error.message}`);
                        isActuallyReady = false;
                    }
                }
                
                // Update the status
                client.isReady = isActuallyReady;
                console.log(`🔧 Fixed client status: ${client.isReady}`);
            }
        }
        
        // Log client status for debugging
        console.log(`🔍 Client status for session ${sessionId}:`, {
            isReady: client.isReady,
            hasClient: !!client,
            clientType: typeof client,
            clientKeys: Object.keys(client || {}),
            hasClientProperty: !!client.client,
            clientPropertyType: typeof client.client,
            clientObjectKeys: client.client ? Object.keys(client.client) : 'N/A'
        });
        
        // Check if client is actually ready by testing the connection
        let isActuallyReady = client.isReady;
        if (client.isReady && client.client) {
            try {
                const clientInfo = client.client.info;
                isActuallyReady = !!clientInfo;
                console.log(`🔍 Client connection test: ${isActuallyReady ? 'SUCCESS' : 'FAILED'}`);
            } catch (error) {
                console.warn(`🔍 Client connection test failed: ${error.message}`);
                isActuallyReady = false;
            }
        }
        
        // Try to wait for client to be ready (max 10 seconds)
        if (!isActuallyReady) {
            console.log(`⏳ Waiting for WhatsApp client to be ready for session ${sessionId}...`);
            let attempts = 0;
            const maxAttempts = 20;
            
            while (!isActuallyReady && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
                
                // Re-test connection
                if (client.isReady && client.client) {
                    try {
                        const clientInfo = client.client.info;
                        isActuallyReady = !!clientInfo;
                    } catch (error) {
                        isActuallyReady = false;
                    }
                }
                
                console.log(`⏳ Attempt ${attempts}/${maxAttempts} - Client ready: ${isActuallyReady} (reported: ${client.isReady})`);
            }
            
            if (!isActuallyReady) {
                console.error(`❌ WhatsApp client not ready for session ${sessionId} after waiting`);
                console.error(`🔍 Final client status:`, {
                    reportedReady: client.isReady,
                    actuallyReady: isActuallyReady,
                    hasClient: !!client,
                    clientType: typeof client,
                    hasClientProperty: !!client.client,
                    clientObjectKeys: client.client ? Object.keys(client.client) : 'N/A'
                });
                await broadcastQueries.updateCampaignStatus(campaignId, 'failed', null, new Date());
                return;
            }
            
            console.log(`✅ WhatsApp client ready for session ${sessionId} after waiting`);
        } else {
            console.log(`✅ WhatsApp client already ready for session ${sessionId}`);
        }

        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];
            
            // Check if campaign is paused
            const currentCampaign = await broadcastQueries.getCampaignById(campaignId);
            if (currentCampaign.status === 'paused') {
                console.log(`📢 Campaign ${campaignId} paused at contact ${i + 1}/${contacts.length}`);
                break;
            }

            try {
                // Format phone number
                let formattedNumber = contact.contact_number.replace(/\D/g, '');
                if (!formattedNumber.endsWith('@c.us')) {
                    formattedNumber = `${formattedNumber}@c.us`;
                }

                let sentMessage;
                
                // Send based on message type with better error handling and timeout
                try {
                    const sendPromise = (async () => {
                        if (messageType === 'text') {
                            return await client.sendMessage(formattedNumber, messageContent);
                        } else if (messageType === 'image' && mediaUrl) {
                            const media = MessageMedia.fromFilePath(mediaUrl);
                            return await client.sendMessage(formattedNumber, media, { caption: messageContent });
                        } else if (messageType === 'document' && mediaUrl) {
                            const media = MessageMedia.fromFilePath(mediaUrl);
                            return await client.sendMessage(formattedNumber, media);
                        } else {
                            throw new Error('Invalid message type or missing media');
                        }
                    })();
                    
                    // Add timeout of 30 seconds for each message
                    sentMessage = await Promise.race([
                        sendPromise,
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Message send timeout')), 30000)
                        )
                    ]);
                } catch (sendError) {
                    console.error(`❌ Send error for ${contact.contact_number}:`, sendError.message);
                    // If send fails, throw the error to be handled by outer catch
                    throw sendError;
                }
                
                // Update message status as sent
                // Handle different ID structures in WhatsApp Web JS
                let messageId = null;
                
                try {
                    if (sentMessage && sentMessage.id) {
                        if (sentMessage.id._serialized) {
                            messageId = sentMessage.id._serialized;
                        } else if (sentMessage.id.id) {
                            messageId = sentMessage.id.id;
                        } else if (typeof sentMessage.id === 'string') {
                            messageId = sentMessage.id;
                        }
                    }
                } catch (idError) {
                    console.warn(`⚠️ Could not extract message ID: ${idError.message}`);
                    messageId = null;
                }
                
                // If message was sent but no ID available, still mark as sent
                await broadcastQueries.updateBroadcastMessageStatus(
                    contact.id, 'sent', messageId
                );
                
                sentCount++;
                
                // Log progress every 10 messages
                if ((i + 1) % 10 === 0) {
                    console.log(`📢 Campaign ${campaignId}: ${i + 1}/${contacts.length} processed (${sentCount} sent, ${failedCount} failed)`);
                }
                
                // Log successful send with message ID if available
                if (messageId) {
                    console.log(`✅ Sent to ${contact.contact_number} (ID: ${messageId})`);
                } else {
                    console.log(`✅ Sent to ${contact.contact_number} (no ID available)`);
                }
                
            } catch (error) {
                console.error(`❌ Failed to send to ${contact.contact_number}:`, error.message);
                
                // Handle specific WhatsApp Web JS errors
                let errorMessage = error.message;
                let shouldMarkAsSent = false;
                
                if (error.message.includes('serialize') || error.message.includes('getMessageModel')) {
                    errorMessage = 'Message sent but failed to get confirmation ID';
                    shouldMarkAsSent = true; // Message was actually sent, just couldn't get ID
                } else if (error.message.includes('Evaluation failed')) {
                    errorMessage = 'WhatsApp Web connection issue';
                } else if (error.message.includes('Protocol error')) {
                    errorMessage = 'Connection timeout or protocol error';
                } else if (error.message.includes('Message send timeout')) {
                    errorMessage = 'Message send timeout';
                } else if (error.message.includes('client is not ready')) {
                    errorMessage = 'WhatsApp client not ready';
                }
                
                // Update message status
                if (shouldMarkAsSent) {
                    await broadcastQueries.updateBroadcastMessageStatus(
                        contact.id, 'sent', null, errorMessage.substring(0, 500)
                    );
                    sentCount++; // Count as sent since message was actually delivered
                    console.log(`⚠️ Marked as sent (no ID): ${contact.contact_number} - ${errorMessage}`);
                } else {
                    await broadcastQueries.updateBroadcastMessageStatus(
                        contact.id, 'failed', null, errorMessage.substring(0, 500)
                    );
                    failedCount++;
                    console.log(`❌ Marked as failed: ${contact.contact_number} - ${errorMessage}`);
                }
            }
            
                    // Update campaign counts periodically
        if ((i + 1) % 10 === 0 || i === contacts.length - 1) {
            await broadcastQueries.updateCampaignCounts(campaignId, sentCount, failedCount);
            console.log(`📈 Progress update: ${i + 1}/${contacts.length} (${sentCount} sent, ${failedCount} failed)`);
        }
            
            // Delay between messages (except for last message)
            if (i < contacts.length - 1 && delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // Final campaign status update
        const finalStatus = failedCount === contacts.length ? 'failed' : 'completed';
        await broadcastQueries.updateCampaignStatus(campaignId, finalStatus, null, new Date());
        await broadcastQueries.updateCampaignCounts(campaignId, sentCount, failedCount);
        
        // Log final campaign summary
        console.log(`📋 Campaign ${campaignId} summary:`, {
            totalContacts: contacts.length,
            sentCount,
            failedCount,
            successRate: `${Math.round((sentCount / contacts.length) * 100)}%`,
            finalStatus
        });

        console.log(`✅ Broadcast campaign ${campaignId} completed: ${sentCount} sent, ${failedCount} failed`);
        console.log(`📊 Final statistics: ${Math.round((sentCount / contacts.length) * 100)}% success rate`);

    } catch (error) {
        console.error(`❌ Error in broadcast campaign ${campaignId}:`, error);
        console.error(`🔍 Error details:`, {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        await broadcastQueries.updateCampaignStatus(campaignId, 'failed', null, new Date());
    }
};

module.exports = broadcastController;