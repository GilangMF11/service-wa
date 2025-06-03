// controllers/api/broadcastController.js
const { broadcastQueries } = require('../../db');
const clients = require('../../clients');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { config } = require('../../config/config');

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

            const deleted = await broadcastQueries.deleteBroadcastList(listId, userId);

            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message: 'Broadcast list not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Broadcast list deleted successfully'
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
            if (!clients[sessionId] || !clients[sessionId].isReady) {
                return res.status(503).json({
                    success: false,
                    message: 'WhatsApp client is not ready. Please scan QR code first.',
                    needScan: true
                });
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

            const contacts = await broadcastQueries.getContactsInBroadcastList(listId, 10000, 0); // Get all contacts
            if (contacts.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No contacts found in broadcast list'
                });
            }

            // Create campaign
            const campaign = await broadcastQueries.createBroadcastCampaign(
                listId, userId, sessionId, campaignName, messageType, 
                messageContent, mediaUrl, mediaFilename, contacts.length, delayMs
            );

            // Create message records
            await broadcastQueries.createBroadcastMessages(campaign.id, contacts);

            // Start broadcast in background
            res.status(200).json({
                success: true,
                message: 'Broadcast started successfully',
                data: {
                    campaignId: campaign.id,
                    totalContacts: contacts.length,
                    estimatedDuration: Math.ceil((contacts.length * delayMs) / 1000 / 60) // minutes
                }
            });

            // Process broadcast in background
            setImmediate(() => {
                processBroadcastSending(sessionId, campaign.id, contacts, messageContent, delayMs, messageType, mediaUrl);
            });

        } catch (error) {
            console.error('Error sending broadcast:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send broadcast',
                error: error.message
            });
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

    // === MEDIA UPLOAD ===
    uploadMedia: upload.single('media')
};

// Background process untuk mengirim broadcast
const processBroadcastSending = async (sessionId, campaignId, contacts, messageContent, delay, messageType = 'text', mediaUrl = null) => {
    try {
        console.log(`📢 Starting broadcast campaign ${campaignId} for ${contacts.length} contacts`);
        
        await broadcastQueries.updateCampaignStatus(campaignId, 'sending', new Date());
        
        let sentCount = 0;
        let failedCount = 0;
        const client = clients[sessionId].client;

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
                
                // Send based on message type
                if (messageType === 'text') {
                    sentMessage = await client.sendMessage(formattedNumber, messageContent);
                } else if (messageType === 'image' && mediaUrl) {
                    const media = MessageMedia.fromFilePath(mediaUrl);
                    sentMessage = await client.sendMessage(formattedNumber, media, { caption: messageContent });
                } else if (messageType === 'document' && mediaUrl) {
                    const media = MessageMedia.fromFilePath(mediaUrl);
                    sentMessage = await client.sendMessage(formattedNumber, media);
                } else {
                    throw new Error('Invalid message type or missing media');
                }
                
                // Update message status as sent
                await broadcastQueries.updateBroadcastMessageStatus(
                    contact.id, 'sent', sentMessage.id.id
                );
                
                sentCount++;
                
                // Log progress every 10 messages
                if ((i + 1) % 10 === 0) {
                    console.log(`📢 Campaign ${campaignId}: ${i + 1}/${contacts.length} processed (${sentCount} sent, ${failedCount} failed)`);
                }
                
            } catch (error) {
                console.error(`❌ Failed to send to ${contact.contact_number}:`, error.message);
                
                // Update message status as failed
                await broadcastQueries.updateBroadcastMessageStatus(
                    contact.id, 'failed', null, error.message.substring(0, 500) // Limit error message length
                );
                
                failedCount++;
            }
            
            // Update campaign counts periodically
            if ((i + 1) % 10 === 0 || i === contacts.length - 1) {
                await broadcastQueries.updateCampaignCounts(campaignId, sentCount, failedCount);
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

        console.log(`✅ Broadcast campaign ${campaignId} completed: ${sentCount} sent, ${failedCount} failed`);

    } catch (error) {
        console.error(`❌ Error in broadcast campaign ${campaignId}:`, error);
        await broadcastQueries.updateCampaignStatus(campaignId, 'failed', null, new Date());
    }
};

module.exports = broadcastController;