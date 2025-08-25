/**
 * Simple VSC Adapter for Leaf Game
 * Streamlined version focusing on core game integration
 */

export class SimpleVSCAdapter {
  constructor(config = {}) {
    this.config = {
      apiUrl: 'https://vsc.hive-engine.com/api/v1/graphql',
      contractId: 'leaf-game-kernel-v1',
      ...config
    };
    
    this.isConnected = false;
    this.eventListeners = new Map();
    
    console.log('🔌 Simple VSC Adapter initialized');
  }

  // Simple connection - just mark as ready
  async connect() {
    this.isConnected = true;
    console.log('✅ Simple VSC Adapter ready');
    return true;
  }

  // Execute a game verb with minimal overhead
  async executeVerb(verb, params) {
    if (!this.isConnected) {
      throw new Error('VSC Adapter not connected');
    }

    console.log(`⚡ Executing: ${verb}`, params);

    try {
      // Simulate VSC call for now
      const result = {
        success: true,
        verb,
        params,
        timestamp: Date.now()
      };

      // Emit event for Leaf
      this.emit('verb:executed', result);
      
      return result;

    } catch (error) {
      console.error(`❌ Verb failed: ${verb}`, error.message);
      return {
        success: false,
        verb,
        params,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Core game verbs - simplified
  async onPlayerEnter(roomId, player) {
    return this.executeVerb('on_enter', { roomId, player });
  }

  async onPlayerLeave(roomId, player) {
    return this.executeVerb('on_leave', { roomId, player });
  }

  async onPlayerSay(roomId, player, message) {
    return this.executeVerb('on_say', { roomId, player, message });
  }

  async onPlayerEmote(roomId, player, emote) {
    return this.executeVerb('on_emote', { roomId, player, emote });
  }

  // Simple event system
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Event callback error:', error);
        }
      });
    }
  }

  // Status check
  getStatus() {
    return {
      connected: this.isConnected,
      contractId: this.config.contractId,
      apiUrl: this.config.apiUrl
    };
  }

  // Clean disconnect
  disconnect() {
    this.isConnected = false;
    this.eventListeners.clear();
    console.log('🔌 Simple VSC Adapter disconnected');
  }
}

// Factory function
export function createSimpleVSCAdapter(config) {
  return new SimpleVSCAdapter(config);
}
