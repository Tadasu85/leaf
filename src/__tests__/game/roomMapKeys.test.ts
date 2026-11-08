import { findRoom, keyForWrite, listRooms, resolveExit, splitKey } from '../../game/rooms/mapKeys';
import { applyApproval } from '../../game/rooms/approval';
import { GameMap } from '../../game/types/GameTypes';

// Today's map shape: permlink keys, author in the entry. "the-dock" is used
// by two authors: ray's under the old key, alice's under the long one.
const map: GameMap = {
  'deep-cavern': { author: 'ray', exits: { north: 'the-dock', east: 'alice/the-dock' } },
  'the-dock': { author: 'ray', exits: { south: 'deep-cavern' } },
  'alice/the-dock': { author: 'alice', exits: { west: 'deep-cavern' } },
};

describe('room map keys', () => {
  it('splits both key forms', () => {
    expect(splitKey('alice/the-dock')).toEqual({ author: 'alice', permlink: 'the-dock' });
    expect(splitKey('the-dock', { author: 'ray' })).toEqual({ author: 'ray', permlink: 'the-dock' });
    expect(splitKey('the-dock')).toBeNull();
    expect(splitKey('/x')).toBeNull();
  });

  it('finds each author\'s room even when they share a permlink', () => {
    expect(findRoom(map, 'ray', 'the-dock')?.key).toBe('the-dock');
    expect(findRoom(map, 'alice', 'the-dock')?.key).toBe('alice/the-dock');
    expect(findRoom(map, 'bob', 'the-dock')).toBeNull();
  });

  it('resolves exits written either way', () => {
    expect(resolveExit(map, 'the-dock')).toMatchObject({ author: 'ray', permlink: 'the-dock' });
    expect(resolveExit(map, 'alice/the-dock')).toMatchObject({ author: 'alice', permlink: 'the-dock' });
    expect(resolveExit(map, 'nowhere')).toBeNull();
    expect(resolveExit(map, 'bob/the-dock')).toBeNull();
  });

  it('lists every room with its author', () => {
    expect(listRooms(map).map((r) => `${r.author}/${r.permlink}`).sort())
      .toEqual(['alice/the-dock', 'ray/deep-cavern', 'ray/the-dock']);
  });

  it('writes the short key only when it is free', () => {
    expect(keyForWrite(map, 'bob', 'new-room')).toBe('new-room');
    expect(keyForWrite(map, 'bob', 'the-dock')).toBe('bob/the-dock');
    expect(keyForWrite(map, 'ray', 'the-dock')).toBe('the-dock');
  });
});

describe('approving a build', () => {
  const request = (author: string, permlink: string) => ({
    room: { author: 'ray', permlink: 'deep-cavern' },
    newRoom: { author, permlink },
    exits: { fromNewRoom: { south: 'deep-cavern' }, fromCurrentRoom: { up: permlink } },
  });

  it('adds a new room under its permlink and links both ways', () => {
    const res = applyApproval(map, request('bob', 'attic'), 100);
    if (!res.ok) throw new Error(res.reason);
    expect(res.newKey).toBe('attic');
    expect(res.rooms['attic']).toEqual({ author: 'bob', exits: { south: 'deep-cavern' } });
    expect(res.rooms['deep-cavern']!.exits).toEqual({ north: 'the-dock', east: 'alice/the-dock', up: 'attic' });
  });

  it("never replaces another author's room with the same permlink", () => {
    const res = applyApproval(map, request('bob', 'the-dock'), 100);
    if (!res.ok) throw new Error(res.reason);
    expect(res.newKey).toBe('bob/the-dock');
    expect(res.rooms['the-dock']).toEqual(map['the-dock']);
    expect(res.rooms['alice/the-dock']).toEqual(map['alice/the-dock']);
    expect(res.rooms['deep-cavern']!.exits.up).toBe('bob/the-dock');
    expect(resolveExit(res.rooms, 'bob/the-dock')).toMatchObject({ author: 'bob' });
  });

  it('refuses a room that is already on the map', () => {
    expect(applyApproval(map, request('alice', 'the-dock'), 100)).toEqual({
      ok: false, reason: 'alice/the-dock is already on the map',
    });
  });

  it('points the way back at a source room stored under a long key', () => {
    const res = applyApproval(map, {
      room: { author: 'alice', permlink: 'the-dock' },
      newRoom: { author: 'alice', permlink: 'pier' },
      exits: { fromNewRoom: { back: 'the-dock' }, fromCurrentRoom: { out: 'pier' } },
    }, 100);
    if (!res.ok) throw new Error(res.reason);
    expect(res.rooms['pier']!.exits).toEqual({ back: 'alice/the-dock' });
    expect(res.rooms['alice/the-dock']!.exits).toEqual({ west: 'deep-cavern', out: 'pier' });
    expect(res.rooms['the-dock']).toEqual(map['the-dock']);
  });

  it('keeps the source room\'s other fields and dates a time event from approval', () => {
    const withFerry: GameMap = { ...map, 'deep-cavern': { ...map['deep-cavern']!, timeEvent: { type: 'ferry', intervalBlocks: 5, startBlock: 1, phases: [] } } };
    const res = applyApproval(withFerry, { ...request('bob', 'attic'), timeEvent: { type: 'ferry', intervalBlocks: 9, phases: [] } }, 777);
    if (!res.ok) throw new Error(res.reason);
    expect(res.rooms['deep-cavern']!.timeEvent).toEqual(withFerry['deep-cavern']!.timeEvent);
    expect(res.rooms['attic']!.timeEvent).toMatchObject({ intervalBlocks: 9, startBlock: 777 });
  });
});
