import config from '../../config';
import logger from '../../utils/Logger';
import { VerbRuntime, VerbResult, Effect } from './VerbRuntime';

// Minimal VSC client stub for the spike; replace with real RPC/WS integration
export class VSCAdapter implements VerbRuntime {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, { onVerbOutput: (lines: string[]) => void; onRoomEffect: (effects: Effect[]) => void }> = new Map();

  constructor() {}

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
    handlers: { onVerbOutput(lines: string[]): void; onRoomEffect(effects: Effect[]): void }
  ): () => void {
    this.ensureWs();
    this.subscriptions.set(roomId, handlers);
    // In a real adapter, we'd send a subscribe message here
    return () => {
      this.subscriptions.delete(roomId);
      if (this.subscriptions.size === 0) {
        this.teardownWs();
      }
    };
  }

  // Private helpers
  private async invoke(method: string, params: Record<string, unknown>): Promise<VerbResult> {
    // TODO: Replace with real VSC RPC call (signed via Keychain RC)
    void method; void params;
    return { output: [], effects: [] };
  }

  private ensureWs() {
    if (this.ws) return;
    try {
      if (!('WebSocket' in window)) return;
      this.ws = new WebSocket(config.vsc.wsUrl);
      this.ws.onopen = () => {
        logger.debug('[VSCAdapter] WS connected');
      };
      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          const { roomId, type } = msg || {};
          const sub = roomId ? this.subscriptions.get(roomId) : null;
          if (!sub) return;
          if (type === 'VerbOutputEvent' && Array.isArray(msg.lines)) {
            sub.onVerbOutput(msg.lines);
          } else if (type === 'RoomEffectEvent' && Array.isArray(msg.effects)) {
            sub.onRoomEffect(msg.effects as Effect[]);
          }
        } catch (e) {
          logger.error('[VSCAdapter] WS message parse error', e);
        }
      };
      this.ws.onclose = () => {
        logger.debug('[VSCAdapter] WS closed');
        this.ws = null;
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
  }
}

export default VSCAdapter;


