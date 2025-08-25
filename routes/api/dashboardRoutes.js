const express = require('express');
const router = express.Router();

// GET /campaigns - Get all campaigns for dashboard
router.get('/campaigns', async (req, res) => {
    try {
        const { broadcastQueries } = require('../../db');
        
        console.log('🔍 Fetching campaigns for dashboard...');
        
        // Get all campaigns with message counts
        const campaigns = await broadcastQueries.getAllCampaigns();
        
        console.log(`📤 Found ${campaigns.length} campaigns:`, campaigns);
        
        // Process campaigns data for dashboard
        const campaignsData = campaigns.map(campaign => ({
            id: campaign.id,
            name: campaign.name || `Campaign ${campaign.id}`,
            created_at: campaign.created_at,
            status: campaign.status || 'completed',
            success_count: campaign.sent_count || 0,
            failed_count: campaign.failed_count || 0,
            total_count: (campaign.sent_count || 0) + (campaign.failed_count || 0)
        }));

        console.log('✅ Processed campaigns data:', campaignsData);
        res.json(campaignsData);
    } catch (error) {
        console.error('❌ Error getting campaigns:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get campaigns',
            error: error.message
        });
    }
});

// GET /lists - Get all broadcast lists for dashboard
router.get('/lists', async (req, res) => {
    try {
        const { broadcastQueries } = require('../../db');
        
        console.log('🔍 Fetching broadcast lists for dashboard...');
        
        // Get all broadcast lists with contact counts
        const lists = await broadcastQueries.getAllBroadcastLists();
        
        console.log(`📋 Found ${lists.length} broadcast lists:`, lists);
        
        // Process lists data for dashboard
        const listsData = lists.map(list => ({
            id: list.id,
            name: list.name,
            description: list.description,
            created_at: list.created_at,
            contact_count: list.contact_count || 0,
            status: list.is_active ? 'active' : 'inactive'
        }));

        console.log('✅ Processed lists data:', listsData);
        res.json(listsData);
    } catch (error) {
        console.error('❌ Error getting broadcast lists:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get broadcast lists',
            error: error.message
        });
    }
});

module.exports = router;
