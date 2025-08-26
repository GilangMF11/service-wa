// Audio Utilities for WhatsApp Service
// Fallback sound effects using Web Audio API

class AudioManager {
  constructor() {
    this.audioContext = null;
    this.sounds = {};
    this.isEnabled = true;
    this.volume = 0.5;
    
    // Initialize audio context
    this.initAudioContext();
  }

  // Initialize Web Audio API context
  initAudioContext() {
    try {
      // Create audio context
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
      
      // Create default sounds
      this.createDefaultSounds();
      
      console.log('🎵 Audio Manager initialized successfully');
    } catch (error) {
      console.warn('⚠️ Web Audio API not supported:', error.message);
      this.isEnabled = false;
    }
  }

  // Create default sound effects
  createDefaultSounds() {
    if (!this.audioContext) return;

    // Message notification sound (pleasant chime)
    this.sounds.message = this.createChimeSound(800, 0.3, 0.1);
    
    // General notification sound (gentle ping)
    this.sounds.notification = this.createPingSound(1000, 0.2, 0.05);
    
    // Error sound (low tone)
    this.sounds.error = this.createToneSound(400, 0.4, 0.2);
    
    // Success sound (high tone)
    this.sounds.success = this.createToneSound(1200, 0.3, 0.1);
  }

  // Create a pleasant chime sound
  createChimeSound(frequency = 800, duration = 0.3, volume = 0.1) {
    return () => {
      if (!this.isEnabled || !this.audioContext) return;
      
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Set frequency and type
      oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
      oscillator.type = 'sine';
      
      // Set volume envelope
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume * this.volume, this.audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
      
      // Play sound
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    };
  }

  // Create a ping sound
  createPingSound(frequency = 1000, duration = 0.2, volume = 0.05) {
    return () => {
      if (!this.isEnabled || !this.audioContext) return;
      
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Set frequency and type
      oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
      oscillator.type = 'triangle';
      
      // Set volume envelope
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume * this.volume, this.audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
      
      // Play sound
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    };
  }

  // Create a simple tone
  createToneSound(frequency = 600, duration = 0.2, volume = 0.1) {
    return () => {
      if (!this.isEnabled || !this.audioContext) return;
      
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Set frequency and type
      oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
      oscillator.type = 'sine';
      
      // Set volume envelope
      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume * this.volume, this.audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
      
      // Play sound
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    };
  }

  // Play a specific sound
  play(soundName) {
    if (!this.isEnabled) return;
    
    if (this.sounds[soundName]) {
      this.sounds[soundName]();
      console.log(`🎵 Playing sound: ${soundName}`);
    } else {
      console.warn(`⚠️ Sound not found: ${soundName}`);
    }
  }

  // Play message notification
  playMessage() {
    this.play('message');
  }

  // Play general notification
  playNotification() {
    this.play('notification');
  }

  // Play error sound
  playError() {
    this.play('error');
  }

  // Play success sound
  playSuccess() {
    this.play('success');
  }

  // Enable/disable sounds
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`🎵 Audio ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Set volume (0.0 to 1.0)
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    console.log(`🎵 Volume set to: ${this.volume}`);
  }

  // Test all sounds
  testSounds() {
    console.log('🧪 Testing all sounds...');
    setTimeout(() => this.playMessage(), 100);
    setTimeout(() => this.playNotification(), 500);
    setTimeout(() => this.playSuccess(), 1000);
    setTimeout(() => this.playError(), 1500);
  }
}

// Create global audio manager instance
window.AudioManager = new AudioManager();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioManager;
}
