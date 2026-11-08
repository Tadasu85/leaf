import { EventEmitter } from 'events';
import { parseRoomObjects, matchObjectAction, objectsToText, textToObjects, renderObjectLine, MAX_OBJECT_ACTIONS } from '../../game/rooms/roomObjects';
import { GameState } from '../../game/state/GameState';
import { RoomData } from '../../game/types/GameTypes';

jest.mock('../../utils/Logger', () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../../game/network/SocketManager', () => ({
  SocketManager: jest.fn().mockImplementation(() => ({ on: jest.fn(), off: jest.fn(), destroy: jest.fn() })),
}));

const bell = { 'brass bell': { ring: { self: 'You ring the bell.', others: '%n rings the bell.' }, polish: { self: 'You polish it.' } } };

describe('room object helpers', () => {
  it('reads objects from post metadata and drops bad entries', () => {
    expect(parseRoomObjects(JSON.stringify({ objects: bell }))).toEqual(bell);
    expect(parseRoomObjects({ objects: { '<script>': { ring: { self: 'x' } }, lamp: { RUB: { self: 'x' }, rub: { self: '' } } } })).toBeUndefined();
    expect(parseRoomObjects('not json')).toBeUndefined();
    expect(parseRoomObjects({})).toBeUndefined();
  });

  it('matches what players type, with or without "the"', () => {
    expect(matchObjectAction(bell, 'ring the brass bell')).toMatchObject({ object: 'brass bell', verb: 'ring' });
    expect(matchObjectAction(bell, 'Ring brass bell')).toMatchObject({ verb: 'ring' });
    expect(matchObjectAction(bell, 'kick brass bell')).toBeNull();
    expect(matchObjectAction(undefined, 'ring bell')).toBeNull();
  });

  it('round-trips the Edit Room text', () => {
    const text = objectsToText(bell);
    expect(text).toBe('ring brass bell: You ring the bell. | %n rings the bell.\npolish brass bell: You polish it.');
    expect(textToObjects(text)).toEqual({ objects: bell });
  });

  it('explains a badly written line', () => {
    expect(textToObjects('ring bell').error).toMatch(/^Line 1: write it like/);
    expect(textToObjects('ring bell: ').error).toMatch(/^Line 1/);
    const tooMany = Array.from({ length: MAX_OBJECT_ACTIONS + 1 }, (_, i) => `ring bell${String.fromCharCode(97 + (i % 26))}${i}: x`).join('\n');
    expect(textToObjects(tooMany).error).toBe(`At most ${MAX_OBJECT_ACTIONS} actions per room.`);
  });

  it('fills in the name', () => {
    expect(renderObjectLine('%n rings it. 100%%', 'alice')).toBe('alice rings it. 100%');
  });
});

describe('GameState room objects', () => {
  let socketManager: any;
  let gameState: GameState;
  const out = () => gameState.getOutputMessages().map(m => m.output);
  const room: RoomData = { id: 'ray/glass', title: 'Glass', description: '', author: 'ray', permlink: 'glass', exits: {}, players: [], details: {}, objects: bell };

  beforeEach(() => {
    socketManager = Object.assign(new EventEmitter(), { announceObjectUse: jest.fn() });
    gameState = new GameState(new EventEmitter() as any, null as any);
    gameState.setSocketManager(socketManager);
    (gameState as any).player = { username: 'alice', location: { author: 'ray', permlink: 'glass' }, isAdmin: false, isBuilder: false, characterDescription: '' };
    (gameState as any).currentRoom = room;
  });

  it('runs an action and tells the room', () => {
    expect(gameState.tryRoomObject('ring the brass bell')).toBe(true);
    expect(out()).toContain('You ring the bell.');
    expect(socketManager.announceObjectUse).toHaveBeenCalledWith({ channelId: 'ray/glass', object: 'brass bell', verb: 'ring' });
  });

  it("doesn't announce actions with no line for others", () => {
    gameState.tryRoomObject('polish brass bell');
    expect(socketManager.announceObjectUse).not.toHaveBeenCalled();
  });

  it('returns false for anything else', () => {
    expect(gameState.tryRoomObject('dance wildly')).toBe(false);
  });

  it("shows others' use with the room author's line", () => {
    socketManager.emit('playerUsedObject', { username: 'bob', channelId: 'ray/glass', object: 'brass bell', verb: 'ring' });
    socketManager.emit('playerUsedObject', { username: 'bob', channelId: 'ray/other', object: 'brass bell', verb: 'ring' });
    expect(out().filter(l => l === 'bob rings the bell.')).toHaveLength(1);
  });

  it('hides players muted in this browser', () => {
    (gameState as any).mutes = { isMuted: (n: string) => n === 'pest' };
    socketManager.emit('playerUsedObject', { username: 'pest', channelId: 'ray/glass', object: 'brass bell', verb: 'ring' });
    expect(out()).not.toContain('pest rings the bell.');
  });
});
