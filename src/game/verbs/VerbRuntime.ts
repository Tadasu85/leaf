// Verb runtime interfaces for Leaf programmability (VSC-backed)

export type Effect =
  | { type: 'SetDetail'; key: string; value: string }
  | { type: 'ClearDetail'; key: string }
  | { type: 'SetExit'; direction: string; permlink: string }
  | { type: 'Broadcast'; text: string }
  | { type: 'GiveItem'; toPlayer: string; itemId: string }
  | { type: 'MovePlayer'; player: string; permlink: string };

export interface VerbResult {
  output: string[];
  effects: Effect[];
}

export interface VerbRuntime {
  onEnter(roomId: string, player: string): Promise<VerbResult>;
  onLeave(roomId: string, player: string): Promise<VerbResult>;
  onSay(roomId: string, player: string, message: string): Promise<VerbResult>;
  onEmote(roomId: string, player: string, emote: string): Promise<VerbResult>;
  onCommand(roomId: string, player: string, text: string): Promise<VerbResult>;
  subscribe(
    roomId: string,
    handlers: {
      onVerbOutput(lines: string[]): void;
      onRoomEffect(effects: Effect[]): void;
    }
  ): () => void; // unsubscribe
}


