// contactController.js
const clients = require('../../clients');
// Get all contacts for a session
const getContacts = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // Cek apakah client ada dan terhubung
        if (!clients[sessionId] || !clients[sessionId].isReady) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp client belum siap atau tidak terhubung'
            });
        }
        
        // Ambil semua kontak
        const contacts = await clients[sessionId].client.getContacts();
        
        res.status(200).json({
            success: true,
            contacts: contacts.map(contact => ({
                id: contact.id._serialized,
                name: contact.name || contact.pushname || '',
                number: contact.number,
                isGroup: contact.isGroup,
                isWAContact: contact.isWAContact,
                profilePictureUrl: contact.profilePictureUrl || null
            }))
        });
    } catch (error) {
        console.error('Error saat mengambil kontak:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil kontak',
            error: error.message
        });
    }
};

// Get contact details
const getContact = async (req, res) => {
    try {
        const { sessionId, contactId } = req.params;
        
        // Cek apakah client ada dan terhubung
        if (!clients[sessionId] || !clients[sessionId].isReady) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp client belum siap atau tidak terhubung'
            });
        }
        
        // Ambil detail kontak
        const contact = await clients[sessionId].client.getContactById(contactId);
        
        if (!contact) {
            return res.status(404).json({
                success: false,
                message: 'Kontak tidak ditemukan'
            });
        }
        
        // Coba ambil foto profil jika tersedia
        let profilePictureUrl = null;
        try {
            profilePictureUrl = await contact.getProfilePicUrl();
        } catch (error) {
            console.log('Tidak dapat mengambil foto profil');
        }
        
        res.status(200).json({
            success: true,
            contact: {
                id: contact.id._serialized,
                name: contact.name || contact.pushname || '',
                number: contact.number,
                isGroup: contact.isGroup,
                isWAContact: contact.isWAContact,
                profilePictureUrl: profilePictureUrl
            }
        });
    } catch (error) {
        console.error('Error saat mengambil detail kontak:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil detail kontak',
            error: error.message
        });
    }
};

module.exports = {
    getContacts,
    getContact
};