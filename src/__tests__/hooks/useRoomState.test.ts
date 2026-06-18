import { renderHook, act } from '@testing-library/react';
import { useRoomState } from '../../hooks/useRoomState';
import { LegacyRoomData, GameJSON } from '../../game/types/GameTypes';

const emptyRoom: LegacyRoomData = {
  body: '',
  title: '',
  players: [],
  details: {},
  exits: {},
  author: '',
  permlink: '',
};

const roomA: LegacyRoomData = {
  body: 'A dark cave.',
  title: 'Cave',
  players: ['alice'],
  details: { stalactites: 'Sharp and icy.' },
  exits: {},
  author: 'auth',
  permlink: 'cave-room',
};

const gameJSONWithExits: GameJSON = {
  'cave-room': { exits: { north: 'auth/forest-room' } },
};

describe('useRoomState', () => {

  // ─── initial state ──────────────────────────────────────────────────────────

  it('starts with empty room data and no game JSON', () => {
    const { result } = renderHook(() => useRoomState());
    expect(result.current.roomData).toEqual(emptyRoom);
    expect(result.current.gameJSON).toEqual({});
    expect(result.current.isLoadedGame).toBe(false);
  });

  // ─── updateRoomData (direct) ────────────────────────────────────────────────

  describe('updateRoomData (direct value)', () => {
    it('sets room data fields', () => {
      const { result } = renderHook(() => useRoomState());
      act(() => { result.current.updateRoomData(roomA); });
      expect(result.current.roomData.title).toBe('Cave');
      expect(result.current.roomData.body).toBe('A dark cave.');
      expect(result.current.roomData.players).toEqual(['alice']);
    });

    it('derives exits from gameJSON, not from the incoming data', () => {
      const { result } = renderHook(() => useRoomState());
      // Load game JSON first
      act(() => { result.current.updateGameJSON(gameJSONWithExits); });
      // Then set room data — exits come from the already-loaded gameJSON
      act(() => { result.current.updateRoomData({ ...roomA, exits: { south: 'other' } }); });
      expect(result.current.roomData.exits).toEqual({ north: 'auth/forest-room' });
    });

    it('exits are empty when permlink is not in gameJSON', () => {
      const { result } = renderHook(() => useRoomState());
      act(() => { result.current.updateRoomData({ ...roomA, permlink: 'no-entry-here' }); });
      expect(result.current.roomData.exits).toEqual({});
    });
  });

  // ─── updateRoomData (functional) ────────────────────────────────────────────

  describe('updateRoomData (functional updater)', () => {
    it('passes current roomData to the updater', () => {
      const { result } = renderHook(() => useRoomState());
      act(() => { result.current.updateRoomData(roomA); });
      act(() => {
        result.current.updateRoomData(prev => ({ ...prev, title: 'Updated Cave' }));
      });
      expect(result.current.roomData.title).toBe('Updated Cave');
    });

    it('preserves exits from gameJSON when using functional updater', () => {
      const { result } = renderHook(() => useRoomState());
      act(() => { result.current.updateGameJSON(gameJSONWithExits); });
      act(() => { result.current.updateRoomData(roomA); });
      act(() => {
        result.current.updateRoomData(prev => ({ ...prev, title: 'Changed' }));
      });
      expect(result.current.roomData.exits).toEqual({ north: 'auth/forest-room' });
    });
  });

  // ─── updateGameJSON ──────────────────────────────────────────────────────────

  describe('updateGameJSON', () => {
    it('stores the new gameJSON', () => {
      const { result } = renderHook(() => useRoomState());
      act(() => { result.current.updateGameJSON(gameJSONWithExits); });
      expect(result.current.gameJSON).toEqual(gameJSONWithExits);
    });

    it('updates roomData.exits from new gameJSON when permlink matches', () => {
      const { result } = renderHook(() => useRoomState());
      // Room data must have the matching permlink
      act(() => { result.current.updateRoomData(roomA); });
      act(() => { result.current.updateGameJSON(gameJSONWithExits); });
      expect(result.current.roomData.exits).toEqual({ north: 'auth/forest-room' });
    });

    it('leaves roomData.exits empty when current permlink is not in new gameJSON', () => {
      const { result } = renderHook(() => useRoomState());
      act(() => { result.current.updateRoomData({ ...roomA, permlink: 'unrelated' }); });
      act(() => { result.current.updateGameJSON(gameJSONWithExits); });
      expect(result.current.roomData.exits).toEqual({});
    });
  });

  // ─── setLoadedGame ───────────────────────────────────────────────────────────

  describe('setLoadedGame', () => {
    it('sets isLoadedGame to true', () => {
      const { result } = renderHook(() => useRoomState());
      act(() => { result.current.setLoadedGame(true); });
      expect(result.current.isLoadedGame).toBe(true);
    });

    it('sets isLoadedGame back to false', () => {
      const { result } = renderHook(() => useRoomState());
      act(() => { result.current.setLoadedGame(true); });
      act(() => { result.current.setLoadedGame(false); });
      expect(result.current.isLoadedGame).toBe(false);
    });
  });

  // ─── hasRoomDataChanged ──────────────────────────────────────────────────────

  describe('hasRoomDataChanged', () => {
    it('returns true when new data differs from current', () => {
      const { result } = renderHook(() => useRoomState());
      act(() => { result.current.updateRoomData(roomA); });
      const changed = { ...roomA, title: 'New Title' };
      expect(result.current.hasRoomDataChanged(changed)).toBe(true);
    });

    it('returns false when new data matches current', () => {
      const { result } = renderHook(() => useRoomState());
      act(() => { result.current.updateRoomData(roomA); });
      // The stored room has exits derived from gameJSON (empty here), so we must
      // compare against what's actually stored, not the raw input.
      const stored = result.current.roomData;
      expect(result.current.hasRoomDataChanged(stored)).toBe(false);
    });
  });

  // ─── resetRoomState ──────────────────────────────────────────────────────────

  describe('resetRoomState', () => {
    it('clears all state back to initial values', () => {
      const { result } = renderHook(() => useRoomState());
      act(() => {
        result.current.updateRoomData(roomA);
        result.current.updateGameJSON(gameJSONWithExits);
        result.current.setLoadedGame(true);
      });
      act(() => { result.current.resetRoomState(); });
      expect(result.current.roomData).toEqual(emptyRoom);
      expect(result.current.gameJSON).toEqual({});
      expect(result.current.isLoadedGame).toBe(false);
    });
  });
});
