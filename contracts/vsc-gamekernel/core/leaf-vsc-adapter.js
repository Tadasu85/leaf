/**
 * Leaf VSC Adapter
 * This integrates our working VSC client with Leaf's verb runtime system
 */

import { RealVSCClient, RealTransaction } from './real-vsc-client-integration.js';

export class LeafVSCAdapter {
  constructor(config = {}) {
    this.config = {
      apiUrl: 'https://vsc.hive-engine.com/api/v1/graphql',
      contractId: 'leaf-game-kernel-v1',
      autoConnect: true,
      ...config
    };
    
    this.client = new RealVSCClient(this.config.apiUrl);
    this.isConnected = false;
    this.contractCache = new Map();
    this.eventListeners = new Map();
    
    console.log('🔌 Leaf VSC Adapter initialized');
  }

  // Connect to VSC network
  async connect() {
    try {
      await this.client.connect();
      this.isConnected = true;
      console.log('✅ Leaf VSC Adapter connected to VSC network');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to VSC network:', error.message);
      return false;
    }
  }

  // Execute a verb on the VSC contract
  async executeVerb(verb, params) {
    if (!this.isConnected) {
      throw new Error('VSC Adapter not connected');
    }

    console.log(`⚡ Executing verb: ${verb} with params:`, params);

    try {
      // Create transaction
      const tx = new RealTransaction()
        .setContract(this.config.contractId)
        .setMethod(verb)
        .setParams(params);

      const txData = await tx.build();

      // Call contract
      const result = await this.client.callContract(
        this.config.contractId,
        verb,
        params
      );

      // Submit transaction
      const submitResult = await this.client.submitTransaction(txData);

      // Emit events for Leaf
      this.emitVerbEvent(verb, params, result, submitResult);

      return {
        success: true,
        verb,
        params,
        result,
        transaction: submitResult,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error(`❌ Verb execution failed: ${verb}`, error.message);
      
      this.emitVerbEvent(verb, params, null, { error: error.message });
      
      return {
        success: false,
        verb,
        params,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Leaf verb hooks that map to VSC contract methods
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

  async onPlayerCommand(roomId, player, command) {
    return this.executeVerb('on_command', { roomId, player, text: command });
  }

  // Event system for Leaf integration
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emitVerbEvent(verb, params, result, transaction) {
    const eventData = {
      verb,
      params,
      result,
      transaction,
      timestamp: Date.now()
    };

    // Emit specific verb event
    this.emit(`verb:${verb}`, eventData);
    
    // Emit general verb event
    this.emit('verb', eventData);
    
    // Emit to Leaf's game state
    this.emit('gameStateUpdate', eventData);
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Get adapter status
  getStatus() {
    return {
      connected: this.isConnected,
      contractId: this.config.contractId,
      apiUrl: this.config.apiUrl,
      eventListeners: Array.from(this.eventListeners.keys()),
      timestamp: Date.now()
    };
  }

  // Disconnect from VSC network
  disconnect() {
    this.isConnected = false;
    this.eventListeners.clear();
    console.log('🔌 Leaf VSC Adapter disconnected');
  }
}

// Factory function for easy creation
export function createLeafVSCAdapter(config) {
  return new LeafVSCAdapter(config);
}

// Default export
export default LeafVSCAdapter;
