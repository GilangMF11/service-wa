// whatsappHelpers.js - Utility functions for WhatsApp message handling

/**
 * Robust message ID extraction that handles different whatsapp-web.js versions
 * @param {Object} result - The result object from sendMessage
 * @returns {string} - The extracted message ID or fallback value
 */
const extractMessageId = (result) => {
    let messageId = null;
    try {
        if (result && result.id) {
            if (result.id._serialized) {
                messageId = result.id._serialized;
            } else if (result.id.id) {
                messageId = result.id.id;
            } else if (typeof result.id === 'string') {
                messageId = result.id;
            } else {
                messageId = JSON.stringify(result.id);
            }
        }
    } catch (error) {
        console.warn('Failed to extract message ID:', error.message);
        messageId = 'unknown';
    }
    return messageId;
};

/**
 * Robust chat ID extraction
 * @param {Object} chat - The chat object
 * @returns {string} - The extracted chat ID or fallback value
 */
const extractChatId = (chat) => {
    let chatId = null;
    try {
        if (chat && chat.id) {
            if (chat.id._serialized) {
                chatId = chat.id._serialized;
            } else if (chat.id.id) {
                chatId = chat.id.id;
            } else if (typeof chat.id === 'string') {
                chatId = chat.id;
            } else {
                chatId = JSON.stringify(chat.id);
            }
        }
    } catch (error) {
        console.warn('Failed to extract chat ID:', error.message);
        chatId = 'unknown';
    }
    return chatId;
};

/**
 * Robust contact ID extraction
 * @param {Object} contact - The contact object
 * @returns {string} - The extracted contact ID or fallback value
 */
const extractContactId = (contact) => {
    let contactId = null;
    try {
        if (contact && contact.id) {
            if (contact.id._serialized) {
                contactId = contact.id._serialized;
            } else if (contact.id.id) {
                contactId = contact.id.id;
            } else if (typeof contact.id === 'string') {
                contactId = contact.id;
            } else {
                contactId = JSON.stringify(contact.id);
            }
        }
    } catch (error) {
        console.warn('Failed to extract contact ID:', error.message);
        contactId = 'unknown';
    }
    return contactId;
};

/**
 * Send message with robust error handling for serialize errors
 * @param {Object} client - WhatsApp client
 * @param {string} contactId - Contact ID to send message to
 * @param {string} message - Message content
 * @returns {Object} - Result object with messageId and timestamp
 */
const sendMessageWithErrorHandling = async (client, contactId, message) => {
    let sendResult;
    let messageId = null;
    let timestamp = Date.now();

    try {
        sendResult = await client.sendMessage(contactId, message);
        
        // Extract message ID
        messageId = extractMessageId(sendResult);
        
        // Get timestamp from result if available
        if (sendResult && sendResult.timestamp) {
            timestamp = sendResult.timestamp;
        }
    } catch (sendError) {
        // Check if it's a serialize error (message was sent but ID extraction failed)
        if (sendError.message && sendError.message.includes('serialize')) {
            console.warn('Message sent but failed to get confirmation ID (serialize error)');
            messageId = 'sent_no_id';
            // Message was actually sent, so we consider it successful
        } else {
            // Re-throw other errors
            throw sendError;
        }
    }

    return {
        messageId,
        timestamp,
        success: true
    };
};

/**
 * Check if error is a serialize error
 * @param {Error} error - The error object
 * @returns {boolean} - True if it's a serialize error
 */
const isSerializeError = (error) => {
    return error.message && error.message.includes('serialize');
};

/**
 * Get appropriate success message based on message ID
 * @param {string} messageId - The message ID
 * @returns {string} - The success message
 */
const getSuccessMessage = (messageId) => {
    if (messageId === 'sent_no_id') {
        return 'Pesan berhasil dikirim (tanpa ID konfirmasi)';
    } else if (messageId === 'unknown') {
        return 'Pesan berhasil dikirim (ID tidak diketahui)';
    } else {
        return 'Pesan berhasil dikirim';
    }
};

module.exports = {
    extractMessageId,
    extractChatId,
    extractContactId,
    sendMessageWithErrorHandling,
    isSerializeError,
    getSuccessMessage
};
