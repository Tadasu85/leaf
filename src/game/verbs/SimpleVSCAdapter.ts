import config from '../../config';
import logger from '../../utils/Logger';
import { VerbRuntime, VerbResult, Effect } from './VerbRuntime';

/**
 * Simple VSC Adapter for Leaf Game
 * Streamlined version that integrates with existing Leaf verb runtime
 */
export class SimpleVSCAdapter implements VerbRuntime {
  private isConnected: boolean = false;
  private eventListeners: Map<string, Function[]> = new Map();
  private roomSubscriptions: Map<string, { 
    onVerbOutput: (lines: string[]) => void; 
    onRoomEffect: (effects: Effect[]) => void;
    onPlayerEffect?: (effects: Effect[]) => void;
  }> = new Map();
  private playerSubscriptions: Map<string, { 
    onPlayerEffect: (effects: Effect[]) => void;
  }> = new Map();

  constructor() {
    logger.info('[SimpleVSCAdapter] Initialized');
  }

  isReady(): boolean {
    return Boolean(config.vsc && config.vsc.contractAddress);
  }

  async onEnter(roomId: string, player: string): Promise<VerbResult> {
    logger.debug('[SimpleVSCAdapter] onEnter', { roomId, player });
    return this.executeVerb('on_enter', { roomId, player });
  }

  async onLeave(roomId: string, player: string): Promise<VerbResult> {
    logger.debug('[SimpleVSCAdapter] onLeave', { roomId, player });
    return this.executeVerb('on_leave', { roomId, player });
  }

  async onSay(roomId: string, player: string, message: string): Promise<VerbResult> {
    logger.debug('[SimpleVSCAdapter] onSay', { roomId, player, message });
    return this.executeVerb('on_say', { roomId, player, message });
  }

  async onEmote(roomId: string, player: string, emote: string): Promise<VerbResult> {
    logger.debug('[SimpleVSCAdapter] onEmote', { roomId, player, emote });
    return this.executeVerb('on_emote', { roomId, player, emote });
  }

  async onCommand(roomId: string, player: string, text: string): Promise<VerbResult> {
    logger.debug('[SimpleVSCAdapter] onCommand', { roomId, player, text });
    return this.executeVerb('on_command', { roomId, player, text });
  }

  // Subscribe to room events
  subscribe(
    roomId: string,
    handlers: { 
      onVerbOutput(lines: string[]): void; 
      onRoomEffect(effects: Effect[]): void;
      onPlayerEffect?: (effects: Effect[]) => void;
    }
  ): () => void {
    logger.debug('[SimpleVSCAdapter] Subscribing to room', roomId);
    this.roomSubscriptions.set(roomId, handlers);
    
    // Simulate VSC subscription success
    this.emit('room:subscribed', { roomId, success: true });
    
    return () => {
      this.roomSubscriptions.delete(roomId);
      logger.debug('[SimpleVSCAdapter] Unsubscribed from room', roomId);
    };
  }

  // Subscribe to player-specific events
  subscribeToPlayer(
    player: string,
    handlers: { onPlayerEffect(effects: Effect[]): void }
  ): () => void {
    logger.debug('[SimpleVSCAdapter] Subscribing to player', player);
    this.playerSubscriptions.set(player, handlers);
    
    // Simulate VSC subscription success
    this.emit('player:subscribed', { player, success: true });
    
    return () => {
      this.playerSubscriptions.delete(player);
      logger.debug('[SimpleVSCAdapter] Unsubscribed from player', player);
    };
  }

  // Execute a game verb with minimal overhead
  private async executeVerb(verb: string, params: Record<string, unknown>): Promise<VerbResult> {
    if (!this.isConnected) {
      this.isConnected = true;
      logger.info('[SimpleVSCAdapter] Connected to VSC network');
    }

    logger.debug(`[SimpleVSCAdapter] Executing: ${verb}`, params);

    try {
      // Simulate VSC contract call for now
      const result: VerbResult = {
        success: true,
        output: [`VSC verb '${verb}' executed successfully`],
        effects: [],
        timestamp: Date.now()
      };

      // Emit verb execution event
      this.emit('verb:executed', { verb, params, result });
      
      // Notify room subscribers if applicable
      const roomId = params.roomId as string;
      if (roomId && this.roomSubscriptions.has(roomId)) {
        const handlers = this.roomSubscriptions.get(roomId)!;
        handlers.onVerbOutput(result.output);
        if (result.effects.length > 0) {
          handlers.onRoomEffect(result.effects);
        }
      }

      // Notify player subscribers if applicable
      const player = params.player as string;
      if (player && this.playerSubscriptions.has(player)) {
        const handlers = this.playerSubscriptions.get(player)!;
        if (result.effects.length > 0) {
          handlers.onPlayerEffect(result.effects);
        }
      }

      return result;

    } catch (error) {
      logger.error(`[SimpleVSCAdapter] Verb execution failed: ${verb}`, error);
      
      const errorResult: VerbResult = {
        success: false,
        output: [`Error executing '${verb}': ${error}`],
        effects: [],
        timestamp: Date.now()
      };

      // Emit error event
      this.emit('verb:error', { verb, params, error: errorResult });
      
      return errorResult;
    }
  }

  // Simple event system
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error('[SimpleVSCAdapter] Event callback error:', error);
        }
      });
    }
  }

  // Get connection status
  getStatus(): { connected: boolean; contractId: string | undefined } {
    return {
      connected: this.isConnected,
      contractId: config.vsc?.contractAddress
    };
  }

  // Clean disconnect
  disconnect(): void {
    this.isConnected = false;
    this.eventListeners.clear();
    this.roomSubscriptions.clear();
    this.playerSubscriptions.clear();
    logger.info('[SimpleVSCAdapter] Disconnected from VSC network');
  }
}
