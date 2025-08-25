import config from '../../config';
import logger from '../../utils/Logger';
import { VerbRuntime, VerbResult, Effect } from './VerbRuntime';

// Minimal VSC client stub for the spike; replace with real RPC/WS integration
export class VSCAdapter implements VerbRuntime {
  private ws: WebSocket | null = null;
  private isWsOpen = false;
  private subscriptions: Map<string, { 
    onVerbOutput: (lines: string[]) => void; 
    onRoomEffect: (effects: Effect[]) => void;
    onPlayerEffect?: (effects: Effect[]) => void;
  }> = new Map();
  private playerSubscriptions: Map<string, { 
    onPlayerEffect: (effects: Effect[]) => void;
  }> = new Map();

  constructor() {}

  isReady(): boolean {
    return Boolean(config.vsc && config.vsc.rpcUrl && config.vsc.wsUrl && config.vsc.contractAddress);
  }

  async onEnter(roomId: string, player: string): Promise<VerbResult> {
    logger.debug('[VSCAdapter] onEnter', { roomId, player });
    return this.invoke('on_enter', { roomId, player });
  }

  async onLeave(roomId: string, player: string): Promise<VerbResult> {
    logger.debug('[VSCAdapter] onLeave', { roomId, player });
    return this.invoke('on_leave', { roomId, player });
  }

  async onSay(roomId: string, player: string, message: string): Promise<VerbResult> {
    logger.debug('[VSCAdapter] onSay', { roomId, player, message });
    return this.invoke('on_say', { roomId, player, message });
  }

  async onEmote(roomId: string, player: string, emote: string): Promise<VerbResult> {
    logger.debug('[VSCAdapter] onEmote', { roomId, player, emote });
    return this.invoke('on_emote', { roomId, player, emote });
  }

  async onCommand(roomId: string, player: string, text: string): Promise<VerbResult> {
    logger.debug('[VSCAdapter] onCommand', { roomId, player, text });
    return this.invoke('on_command', { roomId, player, text });
  }

  subscribe(
    roomId: string,
    handlers: { 
      onVerbOutput(lines: string[]): void; 
      onRoomEffect(effects: Effect[]): void;
      onPlayerEffect?: (effects: Effect[]) => void;
    }
  ): () => void {
    this.ensureWs();
    this.subscriptions.set(roomId, handlers);
    if (this.isWsOpen) {
      this.sendSubscribe(roomId);
    }
    return () => {
      this.subscriptions.delete(roomId);
      if (this.subscriptions.size === 0) {
        this.teardownWs();
      }
    };
  }

  // Subscribe to player-specific events
  subscribeToPlayer(
    player: string,
    handlers: { onPlayerEffect(effects: Effect[]): void }
  ): () => void {
    this.ensureWs();
    this.playerSubscriptions.set(player, handlers);
    if (this.isWsOpen) {
      this.sendPlayerSubscribe(player);
    }
    return () => {
      this.playerSubscriptions.delete(player);
    };
  }

  // Private helpers
  private async invoke(method: string, params: Record<string, unknown>): Promise<VerbResult> {
    try {
      const payload = {
        jsonrpc: '2.0',
        id: `${Date.now()}:${Math.random()}`,
        method: 'contract_invoke',
        params: {
          contract: config.vsc?.contractAddress,
          entry: method,
          args: params
          // NOTE: In a full implementation, include caller identity/signature (Hive Keychain RC)
        }
      };
      const res = await fetch(config.vsc!.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        logger.warn('[VSCAdapter] RPC non-OK', res.status, res.statusText);
        return { output: [], effects: [] };
      }
      const data = await res.json().catch(() => null as any);
      const result = data?.result || {};
      const output = Array.isArray(result.output) ? result.output as string[] : [];
      
      // Convert VSC Effect format to our Effect format
      const vscEffects = Array.isArray(result.effects) ? result.effects : [];
      const effects: Effect[] = vscEffects.map((vscEffect: any) => {
        if (vscEffect.type && vscEffect.data) {
          // Handle different effect types based on the contract's Effect structure
          switch (vscEffect.type) {
            case 'SetDetail':
              try {
                const data = JSON.parse(vscEffect.data);
                return { type: 'SetDetail', key: data.key, value: data.value };
              } catch {
                return { type: 'SetDetail', key: vscEffect.data, value: '' };
              }
            case 'ClearDetail':
              return { type: 'ClearDetail', key: vscEffect.data };
            case 'SetExit':
              try {
                const data = JSON.parse(vscEffect.data);
                return { type: 'SetExit', direction: data.direction, permlink: data.destination };
              } catch {
                return { type: 'SetExit', direction: data.direction, permlink: data.destination };
              }
            case 'ClearExit':
              return { type: 'ClearExit', direction: vscEffect.data };
            case 'TakeItem':
              try {
                const data = JSON.parse(vscEffect.data);
                return { type: 'TakeItem', item: data.item, description: data.description };
              } catch {
                return { type: 'TakeItem', item: vscEffect.data, description: '' };
              }
            case 'DropItem':
              try {
                const data = JSON.parse(vscEffect.data);
                return { type: 'DropItem', item: data.item, description: data.description };
              } catch {
                return { type: 'DropItem', item: vscEffect.data, description: '' };
              }
            case 'GiveItem':
              try {
                const data = JSON.parse(vscEffect.data);
                return { type: 'GiveItem', from: data.from, to: data.to, item: data.item, description: data.description };
              } catch {
                return { type: 'GiveItem', from: '', to: '', item: vscEffect.data, description: '' };
              }
            case 'Broadcast':
              return { type: 'Broadcast', text: vscEffect.data };
            default:
              return { type: 'Broadcast', text: `Effect: ${vscEffect.type} - ${vscEffect.data}` };
          }
        }
        return { type: 'Broadcast', text: 'Unknown effect' };
      });
      
      return { output, effects };
    } catch (e) {
      logger.error('[VSCAdapter] RPC invoke failed', e);
      return { output: [], effects: [] };
    }
  }

  private ensureWs() {
    if (this.ws) return;
    try {
      if (!('WebSocket' in window)) return;
      this.ws = new WebSocket(config.vsc!.wsUrl);
      this.ws.onopen = () => {
        logger.debug('[VSCAdapter] WS connected');
        this.isWsOpen = true;
        // Re-subscribe to all current rooms
        this.subscriptions.forEach((_handlers, roomId) => {
          this.sendSubscribe(roomId);
        });
        // Re-subscribe to all current players
        this.playerSubscriptions.forEach((_handlers, player) => {
          this.sendPlayerSubscribe(player);
        });
      };
      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          const { roomId, player, type } = msg || {};
          
          // Handle room-based events
          if (roomId) {
            const sub = this.subscriptions.get(roomId);
            if (sub) {
              if (type === 'VerbOutputEvent' && Array.isArray(msg.lines)) {
                sub.onVerbOutput(msg.lines);
              } else if (type === 'RoomEffectEvent' && Array.isArray(msg.effects)) {
                sub.onRoomEffect(msg.effects as Effect[]);
              }
            }
          }
          
          // Handle player-based events
          if (player) {
            const playerSub = this.playerSubscriptions.get(player);
            if (playerSub && type === 'PlayerEffectEvent' && Array.isArray(msg.effects)) {
              playerSub.onPlayerEffect(msg.effects as Effect[]);
            }
          }
        } catch (e) {
          logger.error('[VSCAdapter] WS message parse error', e);
        }
      };
      this.ws.onclose = () => {
        logger.debug('[VSCAdapter] WS closed');
        this.ws = null;
        this.isWsOpen = false;
      };
      this.ws.onerror = (e) => {
        logger.error('[VSCAdapter] WS error', e);
      };
    } catch (e) {
      logger.error('[VSCAdapter] WS init failed', e);
    }
  }

  private teardownWs() {
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.isWsOpen = false;
  }

  private sendSubscribe(roomId: string) {
    if (!this.ws || !this.isWsOpen) return;
    try {
      const msg = {
        type: 'subscribe',
        contract: config.vsc?.contractAddress,
        roomId
      };
      this.ws.send(JSON.stringify(msg));
    } catch (e) {
      logger.error('[VSCAdapter] sendSubscribe failed', e);
    }
  }

  private sendPlayerSubscribe(player: string) {
    if (!this.ws || !this.isWsOpen) return;
    try {
      const msg = {
        type: 'subscribe_player',
        contract: config.vsc?.contractAddress,
        player
      };
      this.ws.send(JSON.stringify(msg));
    } catch (e) {
      logger.error('[VSCAdapter] sendPlayerSubscribe failed', e);
    }
  }
}

export default VSCAdapter;


