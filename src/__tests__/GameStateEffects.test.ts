import { EventEmitter } from 'events';
import { GameState } from '../game/state/GameState';
import type { Effect } from '../game/verbs/VerbRuntime';

// Minimal mock HiveClient matching what GameState needs
class MockHiveClient extends EventEmitter {
  getTimeEventConfig = jest.fn();
  registerTimeEventRoom = jest.fn();
  unregisterTimeEventRoom = jest.fn();
  getRoomData = jest.fn();
  getRoomDetails = jest.fn();
  getClient = jest.fn();
  database = { call: jest.fn() } as any;
}

describe('GameState effect application', () => {
  let hiveClient: any;
  let gameState: GameState;

  beforeEach(() => {
    hiveClient = new MockHiveClient();
    gameState = new GameState(hiveClient);
  });

  function setRoom() {
    const room = {
      id: 'author/permlink',
      title: 'Test Room',
      description: 'A room for testing',
      author: 'author',
      permlink: 'permlink',
      exits: {},
      players: [],
      details: {}
    } as any;
    (gameState as any).setCurrentRoom(room);
    return room;
  }

  test('applies SetDetail and ClearDetail effects', () => {
    setRoom();
    const roomStateChanged = jest.fn();
    gameState.on('roomStateChanged', roomStateChanged);

    const effects: Effect[] = [
      { type: 'SetDetail', key: 'sign', value: 'A brass plaque.' },
      { type: 'SetDetail', key: 'note', value: 'Welcome!' }
    ];

    (gameState as any).applyEffects(effects);

    const room = gameState.getCurrentRoom() as any;
    expect(room.details.sign).toBe('A brass plaque.');
    expect(room.details.note).toBe('Welcome!');
    expect(roomStateChanged).toHaveBeenCalled();

    // Now clear one detail
    (gameState as any).applyEffects([{ type: 'ClearDetail', key: 'note' }]);
    const updated = gameState.getCurrentRoom() as any;
    expect(updated.details.note).toBeUndefined();
  });

  test('applies SetExit effect', () => {
    setRoom();
    const effects: Effect[] = [
      { type: 'SetExit', direction: 'north', permlink: 'north-room' }
    ];

    (gameState as any).applyEffects(effects);
    const room = gameState.getCurrentRoom()!;
    expect(room.exits['north']).toBe('north-room');
  });

  test('Broadcast effect adds output message', () => {
    setRoom();
    const outputs: string[] = [];
    gameState.on('output', (m: { output: string; bold: boolean }) => {
      outputs.push(m.output);
    });

    (gameState as any).applyEffects([{ type: 'Broadcast', text: 'Hello adventurers!' }]);
    expect(outputs).toContain('Hello adventurers!');
  });
});


