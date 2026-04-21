// clients.js
// Memberikan akses ke objek clients yang dikelola oleh WhatsAppService
const WhatsAppService = require('./services/WhatsAppService');

module.exports = WhatsAppService.clients;