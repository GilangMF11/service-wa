// routes/api/broadcastRoutes.js
const express = require('express');
const router = express.Router();
const broadcastController = require('../../controllers/api/broadcastController');
const broadcastMiddleware = require('../../middleware/broadcastMiddleware');

// Middleware untuk validasi session ID dan menambahkan db ke request
const validateSessionId = (req, res, next) => {
    const { sessionId } = req.params;
    
    if (!sessionId) {
        return res.status(400).json({
            success: false,
            message: 'Session ID is required'
        });
    }
    
    // Add db queries to request for controller access
    req.db = require('../../db');
    next();
};

// Apply session validation to all routes
router.use('/:sessionId/*', validateSessionId);

// === BROADCAST LISTS ROUTES ===

// GET /:sessionId/broadcast/lists - Get all broadcast lists for user
router.get('/:sessionId/broadcast/lists', 
    broadcastMiddleware.validateSession,
    broadcastController.getBroadcastLists
);

// POST /:sessionId/broadcast/lists - Create new broadcast list
router.post('/:sessionId/broadcast/lists', 
    broadcastMiddleware.validateSession,
    broadcastMiddleware.broadcastRateLimit,
    broadcastController.createBroadcastList
);

// GET /:sessionId/broadcast/lists/:listId - Get specific broadcast list details
router.get('/:sessionId/broadcast/lists/:listId', 
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateListOwnership,
    broadcastController.getBroadcastListDetails
);

// PUT /:sessionId/broadcast/lists/:listId - Update broadcast list
router.put('/:sessionId/broadcast/lists/:listId', 
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateListOwnership,
    broadcastMiddleware.broadcastRateLimit,
    broadcastController.updateBroadcastList
);

// DELETE /:sessionId/broadcast/lists/:listId - Delete broadcast list
router.delete('/:sessionId/broadcast/lists/:listId', 
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateListOwnership,
    broadcastMiddleware.broadcastRateLimit,
    broadcastController.deleteBroadcastList
);

// === BROADCAST CONTACTS ROUTES ===

// GET /:sessionId/broadcast/lists/:listId/contacts - Get contacts in broadcast list
router.get('/:sessionId/broadcast/lists/:listId/contacts', 
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateListOwnership,
    broadcastController.getBroadcastContacts
);

// POST /:sessionId/broadcast/lists/:listId/contacts - Add contacts to broadcast list
router.post('/:sessionId/broadcast/lists/:listId/contacts', 
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateListOwnership,
    broadcastMiddleware.validateContactData,
    broadcastMiddleware.broadcastRateLimit,
    broadcastController.addBroadcastContacts
);

// POST /:sessionId/broadcast/lists/:listId/contacts/bulk - Bulk add contacts with CSV import
router.post('/:sessionId/broadcast/lists/:listId/contacts/bulk',
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateListOwnership,
    broadcastMiddleware.broadcastRateLimit,
    (req, res, next) => {
        // Handle CSV file upload
        const multer = require('multer');
        const upload = multer({ 
            dest: 'temp/',
            fileFilter: (req, file, cb) => {
                if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
                    cb(null, true);
                } else {
                    cb(new Error('Only CSV files allowed'), false);
                }
            }
        });
        
        upload.single('csvFile')(req, res, next);
    },
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'CSV file is required'
                });
            }

            const fs = require('fs');
            const path = require('path');
            const csv = require('csv-parser');
            
            const contacts = [];
            const filePath = req.file.path;
            
            // Parse CSV file
            await new Promise((resolve, reject) => {
                fs.createReadStream(filePath)
                    .pipe(csv())
                    .on('data', (row) => {
                        // Expected CSV format: number,name
                        if (row.number) {
                            contacts.push({
                                number: row.number.toString().trim(),
                                name: (row.name || row.number).toString().trim()
                            });
                        }
                    })
                    .on('end', resolve)
                    .on('error', reject);
            });

            // Clean up temp file
            fs.unlinkSync(filePath);

            if (contacts.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No valid contacts found in CSV file'
                });
            }

            // Add contacts to request and call controller
            req.body.contacts = contacts;
            req.validContacts = contacts.filter(contact => {
                const number = contact.number.replace(/\D/g, '');
                return number.length >= 10;
            }).map(contact => ({
                number: contact.number.replace(/\D/g, ''),
                name: contact.name
            }));

            broadcastController.addBroadcastContacts(req, res);

        } catch (error) {
            console.error('Error processing CSV:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process CSV file',
                error: error.message
            });
        }
    }
);

// PUT /:sessionId/broadcast/lists/:listId/contacts/:contactNumber - Update specific contact
router.put('/:sessionId/broadcast/lists/:listId/contacts/:contactNumber',
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateListOwnership,
    async (req, res) => {
        try {
            const { listId, contactNumber } = req.params;
            const { name } = req.body;
            
            if (!name || name.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Contact name is required'
                });
            }

            const cleanNumber = contactNumber.replace(/\D/g, '');
            const { broadcastQueries } = req.db;
            
            const updated = await broadcastQueries.updateContactInBroadcastList(listId, cleanNumber, name.trim());
            
            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: 'Contact not found in broadcast list'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Contact updated successfully',
                data: updated
            });
        } catch (error) {
            console.error('Error updating contact:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update contact',
                error: error.message
            });
        }
    }
);

// DELETE /:sessionId/broadcast/lists/:listId/contacts/:contactNumber - Remove contact from list
router.delete('/:sessionId/broadcast/lists/:listId/contacts/:contactNumber', 
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateListOwnership,
    broadcastController.removeBroadcastContact
);

// DELETE /:sessionId/broadcast/lists/:listId/contacts - Remove multiple contacts
router.delete('/:sessionId/broadcast/lists/:listId/contacts',
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateListOwnership,
    async (req, res) => {
        try {
            const { listId } = req.params;
            const { contactNumbers } = req.body;
            
            if (!contactNumbers || !Array.isArray(contactNumbers) || contactNumbers.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Contact numbers array is required'
                });
            }

            const { broadcastQueries } = req.db;
            let removedCount = 0;
            
            for (const number of contactNumbers) {
                const cleanNumber = number.replace(/\D/g, '');
                const removed = await broadcastQueries.removeContactFromBroadcastList(listId, cleanNumber);
                if (removed) removedCount++;
            }

            res.status(200).json({
                success: true,
                message: `${removedCount} contacts removed successfully`,
                data: {
                    removed: removedCount,
                    total: contactNumbers.length
                }
            });
        } catch (error) {
            console.error('Error removing contacts:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to remove contacts',
                error: error.message
            });
        }
    }
);

// === BROADCAST CAMPAIGNS ROUTES ===

// GET /:sessionId/broadcast/campaigns - Get all broadcast campaigns for user
router.get('/:sessionId/broadcast/campaigns', 
    broadcastMiddleware.validateSession,
    broadcastController.getBroadcastCampaigns
);

// POST /:sessionId/broadcast/send - Send broadcast message
router.post('/:sessionId/broadcast/send', 
    broadcastMiddleware.validateSession,
    broadcastMiddleware.checkClientReady,
    broadcastMiddleware.validateMessageContent,
    broadcastMiddleware.broadcastRateLimit,
    broadcastController.sendBroadcast
);

// POST /:sessionId/broadcast/schedule - Schedule broadcast for later
router.post('/:sessionId/broadcast/schedule',
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateMessageContent,
    broadcastMiddleware.broadcastRateLimit,
    async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;
            const { 
                listId, 
                campaignName, 
                messageType = 'text', 
                messageContent, 
                scheduledAt,
                delay = 1000 
            } = req.body;

            if (!scheduledAt) {
                return res.status(400).json({
                    success: false,
                    message: 'Scheduled time is required'
                });
            }

            const scheduledDate = new Date(scheduledAt);
            if (scheduledDate <= new Date()) {
                return res.status(400).json({
                    success: false,
                    message: 'Scheduled time must be in the future'
                });
            }

            // Get contacts count
            const { broadcastQueries } = req.db;
            const contacts = await broadcastQueries.getContactsInBroadcastList(listId, 10000, 0);
            
            if (contacts.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No contacts found in broadcast list'
                });
            }

            // Create scheduled campaign
            const campaign = await broadcastQueries.createBroadcastCampaign(
                listId, userId, sessionId, campaignName, messageType, 
                messageContent, null, null, contacts.length, delay
            );

            // Update with scheduled time
            await broadcastQueries.updateCampaignSchedule(campaign.id, scheduledDate);

            res.status(201).json({
                success: true,
                message: 'Broadcast scheduled successfully',
                data: {
                    campaignId: campaign.id,
                    scheduledAt: scheduledDate,
                    totalContacts: contacts.length
                }
            });
        } catch (error) {
            console.error('Error scheduling broadcast:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to schedule broadcast',
                error: error.message
            });
        }
    }
);

// GET /:sessionId/broadcast/campaigns/:campaignId - Get campaign details with statistics
router.get('/:sessionId/broadcast/campaigns/:campaignId', 
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateCampaignOwnership,
    broadcastController.getCampaignDetails
);

// POST /:sessionId/broadcast/campaigns/:campaignId/pause - Pause running campaign
router.post('/:sessionId/broadcast/campaigns/:campaignId/pause', 
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateCampaignOwnership,
    broadcastController.pauseCampaign
);

// POST /:sessionId/broadcast/campaigns/:campaignId/resume - Resume paused campaign
router.post('/:sessionId/broadcast/campaigns/:campaignId/resume',
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateCampaignOwnership,
    broadcastMiddleware.checkClientReady,
    async (req, res) => {
        try {
            const { campaignId } = req.params;
            
            if (req.campaign.status !== 'paused') {
                return res.status(400).json({
                    success: false,
                    message: 'Campaign is not paused'
                });
            }

            const { broadcastQueries } = req.db;
            await broadcastQueries.updateCampaignStatus(campaignId, 'sending');

            // Get pending messages and continue processing
            const pendingMessages = await broadcastQueries.getPendingMessages(campaignId, 1000);
            
            if (pendingMessages.length > 0) {
                // Resume broadcast processing in background
                setImmediate(() => {
                    const { processBroadcastSending } = require('../../controllers/api/broadcastController');
                    processBroadcastSending(
                        req.params.sessionId, 
                        campaignId, 
                        pendingMessages, 
                        req.campaign.message_content,
                        req.campaign.delay_ms,
                        req.campaign.message_type
                    );
                });
            }

            res.status(200).json({
                success: true,
                message: 'Campaign resumed successfully',
                data: {
                    pendingMessages: pendingMessages.length
                }
            });
        } catch (error) {
            console.error('Error resuming campaign:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to resume campaign',
                error: error.message
            });
        }
    }
);

// POST /:sessionId/broadcast/campaigns/:campaignId/stop - Stop campaign completely
router.post('/:sessionId/broadcast/campaigns/:campaignId/stop',
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateCampaignOwnership,
    async (req, res) => {
        try {
            const { campaignId } = req.params;
            
            if (!['sending', 'paused'].includes(req.campaign.status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Campaign cannot be stopped'
                });
            }

            const { broadcastQueries } = req.db;
            await broadcastQueries.updateCampaignStatus(campaignId, 'failed', null, new Date());

            res.status(200).json({
                success: true,
                message: 'Campaign stopped successfully'
            });
        } catch (error) {
            console.error('Error stopping campaign:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to stop campaign',
                error: error.message
            });
        }
    }
);

// DELETE /:sessionId/broadcast/campaigns/:campaignId - Delete campaign
router.delete('/:sessionId/broadcast/campaigns/:campaignId',
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateCampaignOwnership,
    async (req, res) => {
        try {
            const { campaignId } = req.params;
            
            if (req.campaign.status === 'sending') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete running campaign. Stop it first.'
                });
            }

            const { broadcastQueries } = req.db;
            await broadcastQueries.deleteCampaign(campaignId);

            res.status(200).json({
                success: true,
                message: 'Campaign deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting campaign:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete campaign',
                error: error.message
            });
        }
    }
);

// === MEDIA UPLOAD ROUTES ===

// POST /:sessionId/broadcast/upload - Upload media for broadcast
router.post('/:sessionId/broadcast/upload', 
    broadcastMiddleware.validateSession,
    (req, res, next) => {
        broadcastController.uploadMedia(req, res, (err) => {
            if (err) {
                return res.status(400).json({
                    success: false,
                    message: 'File upload failed',
                    error: err.message
                });
            }
            next();
        });
    }, 
    (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            const fileUrl = `/uploads/broadcast/${req.file.filename}`;

            res.status(200).json({
                success: true,
                message: 'File uploaded successfully',
                data: {
                    filename: req.file.filename,
                    originalName: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size,
                    url: fileUrl,
                    path: req.file.path
                }
            });
        } catch (error) {
            console.error('Error in upload response:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process uploaded file',
                error: error.message
            });
        }
    }
);

// DELETE /:sessionId/broadcast/upload/:filename - Delete uploaded file
router.delete('/:sessionId/broadcast/upload/:filename',
    broadcastMiddleware.validateSession,
    async (req, res) => {
        try {
            const { filename } = req.params;
            const fs = require('fs');
            const path = require('path');
            
            const filePath = path.join(__dirname, '../../uploads/broadcast', filename);
            
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                res.status(200).json({
                    success: true,
                    message: 'File deleted successfully'
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'File not found'
                });
            }
        } catch (error) {
            console.error('Error deleting file:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete file',
                error: error.message
            });
        }
    }
);

// === UTILITY ROUTES ===

// GET /:sessionId/broadcast/stats - Get broadcast statistics overview
router.get('/:sessionId/broadcast/stats', 
    broadcastMiddleware.validateSession,
    async (req, res) => {
        try {
            const { sessionId } = req.params;
            const userId = req.user.id;

            const { broadcastQueries } = req.db;
            const stats = await broadcastQueries.getBroadcastOverviewStats(userId, sessionId);

            // Additional stats
            const recentCampaigns = await broadcastQueries.getBroadcastCampaigns(userId, sessionId, 5, 0);
            const activeCampaigns = await broadcastQueries.getBroadcastCampaigns(userId, sessionId, 10, 0, 'sending');

            res.status(200).json({
                success: true,
                data: {
                    overview: stats,
                    recentCampaigns,
                    activeCampaigns: activeCampaigns.length,
                    generatedAt: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error('Error getting broadcast stats:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get broadcast statistics',
                error: error.message
            });
        }
    }
);

// GET /:sessionId/broadcast/templates - Get message templates
router.get('/:sessionId/broadcast/templates', 
    broadcastMiddleware.validateSession,
    async (req, res) => {
        try {
            // This can be enhanced to load from database
            const templates = [
                {
                    id: 1,
                    name: 'Welcome Message',
                    content: 'Hello {{name}}, welcome to our service! We\'re excited to have you on board.',
                    category: 'greeting',
                    variables: ['name']
                },
                {
                    id: 2,
                    name: 'Promotion Alert',
                    content: 'Special offer for you! Get {{discount}}% off on all items. Use code: {{code}}',
                    category: 'promotion',
                    variables: ['discount', 'code']
                },
                {
                    id: 3,
                    name: 'Appointment Reminder',
                    content: 'Don\'t forget about your appointment on {{date}} at {{time}}. Location: {{location}}',
                    category: 'reminder',
                    variables: ['date', 'time', 'location']
                },
                {
                    id: 4,
                    name: 'Order Confirmation',
                    content: 'Your order #{{orderNumber}} has been confirmed. Total: {{amount}}. Expected delivery: {{deliveryDate}}',
                    category: 'order',
                    variables: ['orderNumber', 'amount', 'deliveryDate']
                },
                {
                    id: 5,
                    name: 'Event Invitation',
                    content: 'You\'re invited to {{eventName}} on {{date}} at {{venue}}. RSVP by {{rsvpDate}}.',
                    category: 'event',
                    variables: ['eventName', 'date', 'venue', 'rsvpDate']
                }
            ];

            res.status(200).json({
                success: true,
                data: {
                    templates,
                    categories: ['greeting', 'promotion', 'reminder', 'order', 'event']
                }
            });
        } catch (error) {
            console.error('Error getting templates:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get templates',
                error: error.message
            });
        }
    }
);

// POST /:sessionId/broadcast/templates - Create custom template
router.post('/:sessionId/broadcast/templates',
    broadcastMiddleware.validateSession,
    async (req, res) => {
        try {
            const { name, content, category, variables } = req.body;
            
            if (!name || !content) {
                return res.status(400).json({
                    success: false,
                    message: 'Template name and content are required'
                });
            }

            // This would save to database in a real implementation
            const template = {
                id: Date.now(), // Temporary ID
                name: name.trim(),
                content: content.trim(),
                category: category || 'custom',
                variables: variables || [],
                userId: req.user.id,
                createdAt: new Date().toISOString()
            };

            res.status(201).json({
                success: true,
                message: 'Template created successfully',
                data: template
            });
        } catch (error) {
            console.error('Error creating template:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create template',
                error: error.message
            });
        }
    }
);

// GET /:sessionId/broadcast/export/contacts/:listId - Export contacts to CSV
router.get('/:sessionId/broadcast/export/contacts/:listId',
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateListOwnership,
    async (req, res) => {
        try {
            const { listId } = req.params;
            const { broadcastQueries } = req.db;
            
            const contacts = await broadcastQueries.getContactsInBroadcastList(listId, 10000, 0);
            
            if (contacts.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No contacts found to export'
                });
            }

            // Generate CSV content
            const csvContent = [
                'number,name,created_at', // Header
                ...contacts.map(contact => 
                    `${contact.contact_number},"${contact.contact_name}",${contact.created_at}`
                )
            ].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="broadcast_list_${listId}_contacts.csv"`);
            res.status(200).send(csvContent);

        } catch (error) {
            console.error('Error exporting contacts:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export contacts',
                error: error.message
            });
        }
    }
);

// GET /:sessionId/broadcast/export/campaign/:campaignId - Export campaign report
router.get('/:sessionId/broadcast/export/campaign/:campaignId',
    broadcastMiddleware.validateSession,
    broadcastMiddleware.validateCampaignOwnership,
    async (req, res) => {
        try {
            const { campaignId } = req.params;
            const { broadcastQueries } = req.db;
            
            const messages = await broadcastQueries.getBroadcastMessagesByCampaign(campaignId, 10000, 0);
            
            if (messages.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No campaign data found to export'
                });
            }

            // Generate CSV content
            const csvContent = [
                'contact_number,contact_name,status,sent_at,delivered_at,error_message', // Header
                ...messages.map(msg => 
                    `${msg.contact_number},"${msg.contact_name || ''}",${msg.status},${msg.sent_at || ''},${msg.delivered_at || ''},"${msg.error_message || ''}"`
                )
            ].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="campaign_${campaignId}_report.csv"`);
            res.status(200).send(csvContent);

        } catch (error) {
            console.error('Error exporting campaign:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export campaign report',
                error: error.message
            });
        }
    }
);

// === ERROR HANDLING MIDDLEWARE ===

// Error handling middleware untuk broadcast routes
router.use((error, req, res, next) => {
    console.error('Broadcast route error:', error);
    
    // Handle multer errors
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'File too large. Maximum size allowed is 10MB'
        });
    }
    
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
            success: false,
            message: 'Unexpected file field'
        });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            error: error.message
        });
    }

    // Handle database errors
    if (error.code && error.code.startsWith('23')) { // PostgreSQL error codes
        return res.status(400).json({
            success: false,
            message: 'Database constraint violation',
            error: 'Invalid data provided'
        });
    }
    
    res.status(500).json({
        success: false,
        message: 'Internal server error in broadcast module',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

module.exports = router;