import { EventEmitter } from 'events';
import { GameState } from '../../game/state/GameState';
import { CommandParser } from '../../game/commands/CommandParser';

jest.mock('../../utils/Logger', () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    signalingServer: 'https://srv',
    game: { idName: 'ego-death', account: 'hive-109456', startRoom: { author: 'ray', permlink: 'genesis' } },
    builders: [],
    admins: [],
  },
}));
jest.mock('../../game/network/SocketManager', () => ({
  SocketManager: jest.fn().mockImplementation(() => ({ on: jest.fn(), off: jest.fn(), destroy: jest.fn() })),
}));

describe('page, whisper and who commands', () => {
  const parse = (t: string) => new CommandParser().parse(t);
  it('parses them', () => {
    expect(parse('page @bob meet me at the bell')).toMatchObject({ type: 'page', args: ['bob', 'meet me at the bell'] });
    expect(parse('whisper bob psst')).toMatchObject({ type: 'whisper', args: ['bob', 'psst'] });
    expect(parse('who')).toMatchObject({ type: 'who' });
  });
  it('needs a player and a message', () => {
    expect(parse('page bob')).toBeNull();
    expect(parse('whisper')).toBeNull();
  });
});

describe('GameState page, whisper and who', () => {
  let socketManager: any;
  let gameState: GameState;
  const out = () => gameState.getOutputMessages().map(m => m.output);

  beforeEach(() => {
    socketManager = Object.assign(new EventEmitter(), { sendPrivate: jest.fn(() => true), requestWho: jest.fn(() => true) });
    gameState = new GameState(new EventEmitter() as any, null as any);
    gameState.setSocketManager(socketManager);
    (gameState as any).player = { username: 'alice', location: null, isAdmin: false, isBuilder: false, characterDescription: '' };
  });

  it('sends through the chat server', () => {
    gameState.sendPrivate('page', 'bob', 'hi');
    expect(socketManager.sendPrivate).toHaveBeenCalledWith('page', 'bob', 'hi');
    gameState.requestWho();
    expect(socketManager.requestWho).toHaveBeenCalled();
  });

  it('says when chat is down', () => {
    socketManager.sendPrivate.mockReturnValue(false);
    gameState.sendPrivate('whisper', 'bob', 'hi');
    expect(out()).toContain("Chat isn't connected right now.");
  });

  it('shows received pages and whispers, and confirmations', () => {
    socketManager.emit('privateMessage', { kind: 'page', from: 'bob', message: 'where are you?' });
    socketManager.emit('privateMessage', { kind: 'whisper', from: 'bob', message: 'psst' });
    socketManager.emit('privateResult', { ok: true, kind: 'page', target: 'bob', message: 'on my way' });
    socketManager.emit('privateResult', { ok: false, kind: 'page', target: 'carl', message: "carl isn't online." });
    expect(out()).toEqual(expect.arrayContaining([
      'bob pages you from afar: "where are you?"',
      'bob whispers to you: "psst"',
      'You page bob: "on my way"',
      "carl isn't online.",
    ]));
  });

  it('lists who is online', () => {
    socketManager.emit('whoList', { players: ['alice', 'bob'] });
    expect(out()).toContain('Online now (2): alice, bob');
    socketManager.emit('whoList', { players: [] });
    expect(out()).toContain('Nobody else is online right now.');
  });

  it('hides players muted in this browser once the mute feature is present', () => {
    (gameState as any).mutes = { isMuted: (n: string) => n === 'pest' };
    socketManager.emit('privateMessage', { kind: 'page', from: 'pest', message: 'spam' });
    socketManager.emit('whoList', { players: ['alice', 'pest'] });
    expect(out()).not.toContain('pest pages you from afar: "spam"');
    expect(out()).toContain('Online now (1): alice');
  });
});
