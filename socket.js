let io;

module.exports = {
  init: (server) => {
    io = require('socket.io')(server, {
      cors: { origin: '*' }
    });
    
    // Handle client connections
    io.on('connection', (socket) => {
      console.log('🔌 Client connected:', socket.id);
      
      // Join session room
      socket.on('join-session', (sessionId) => {
        socket.join(`session-${sessionId}`);
        console.log(`📱 Client ${socket.id} joined session: ${sessionId}`);
      });
      
      // Leave session room
      socket.on('leave-session', (sessionId) => {
        socket.leave(`session-${sessionId}`);
        console.log(`📱 Client ${socket.id} left session: ${sessionId}`);
      });
      
      // Handle disconnect
      socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
      });
    });
    
    return io;
  },
  
  getIO: () => {
    if (!io) {
      throw new Error("Socket.io belum diinisialisasi.");
    }
    return io;
  },
  
  // Emit new message to specific session
  emitNewMessage: (sessionId, messageData) => {
    if (io) {
      io.to(`session-${sessionId}`).emit('new-message', messageData);
      console.log(`📨 Emitting new message to session ${sessionId}:`, messageData);
    }
  },
  
  // Emit message status update
  emitMessageStatus: (sessionId, messageId, status) => {
    if (io) {
      io.to(`session-${sessionId}`).emit('message-status', { messageId, status });
      console.log(`📊 Emitting message status to session ${sessionId}:`, { messageId, status });
    }
  }
};
