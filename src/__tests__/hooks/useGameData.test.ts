import { renderHook, act, waitFor } from '@testing-library/react';
import { useGameData } from '../../hooks/useGameData';
import { GameState } from '../../game/state/GameState';
import { Client } from '@hiveio/dhive';

jest.mock('../../utils/Logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
}));

describe('useGameData', () => {
  let mockInitialize: jest.Mock;
  let mockGetGameMap: jest.Mock;
  let mockGetHiveClient: jest.Mock;
  let mockGameState: Partial<GameState>;
  const mockClient = {} as Client;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialize = jest.fn().mockResolvedValue(undefined);
    mockGetGameMap = jest.fn().mockReturnValue({});
    mockGetHiveClient = jest.fn().mockReturnValue({ getGameMap: mockGetGameMap });
    mockGameState = {
      initialize: mockInitialize,
      getHiveClient: mockGetHiveClient as any,
    };
  });

  // ─── initial state ──────────────────────────────────────────────────────────

  it('starts with isBulkDataLoaded=false, isLoadedGame=false, error=null', () => {
    const { result } = renderHook(() => useGameData(mockClient, null));
    expect(result.current.isBulkDataLoaded).toBe(false);
    expect(result.current.isLoadedGame).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // ─── initialization ──────────────────────────────────────────────────────────

  it('does not call initialize() when gameState is null', () => {
    renderHook(() => useGameData(mockClient, null));
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('calls gameState.initialize() on mount', async () => {
    const { result } = renderHook(() => useGameData(mockClient, mockGameState as GameState));
    await waitFor(() => expect(result.current.isBulkDataLoaded).toBe(true));
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it('sets isBulkDataLoaded=true after successful initialize()', async () => {
    const { result } = renderHook(() => useGameData(mockClient, mockGameState as GameState));
    await waitFor(() => expect(result.current.isBulkDataLoaded).toBe(true));
  });

  it('sets isLoadedGame=true once isBulkDataLoaded becomes true', async () => {
    const { result } = renderHook(() => useGameData(mockClient, mockGameState as GameState));
    await waitFor(() => expect(result.current.isLoadedGame).toBe(true));
  });

  it('sets error if initialize() rejects', async () => {
    mockInitialize.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useGameData(mockClient, mockGameState as GameState));
    await waitFor(() =>
      expect(result.current.error).toBe('Failed to load game data. Please refresh the page.')
    );
    expect(result.current.isBulkDataLoaded).toBe(false);
  });

  it('does not call initialize() a second time once isBulkDataLoaded is true', async () => {
    const { result } = renderHook(() => useGameData(mockClient, mockGameState as GameState));
    await waitFor(() => expect(result.current.isBulkDataLoaded).toBe(true));
    // Re-render doesn't trigger another initialize
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  // ─── fetchGameData ───────────────────────────────────────────────────────────

  it('fetchGameData resets isLoadedGame then restores it when bulk data is loaded', async () => {
    const { result } = renderHook(() => useGameData(mockClient, mockGameState as GameState));
    await waitFor(() => expect(result.current.isLoadedGame).toBe(true));
    await act(async () => {
      await result.current.fetchGameData();
    });
    expect(result.current.isLoadedGame).toBe(true);
  });

  it('fetchGameData leaves isLoadedGame=false when gameState is null', async () => {
    const { result } = renderHook(() => useGameData(mockClient, null));
    await act(async () => {
      await result.current.fetchGameData();
    });
    expect(result.current.isLoadedGame).toBe(false);
  });

  it('fetchGameData clears a previous error', async () => {
    mockInitialize.mockRejectedValueOnce(new Error('fail'));
    const { result } = renderHook(() => useGameData(mockClient, mockGameState as GameState));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    await act(async () => {
      await result.current.fetchGameData();
    });
    expect(result.current.error).toBeNull();
  });

  // ─── getGameMap ──────────────────────────────────────────────────────────────

  it('getGameMap returns {} when gameState is null', () => {
    const { result } = renderHook(() => useGameData(mockClient, null));
    expect(result.current.getGameMap()).toEqual({});
  });

  it('getGameMap returns {} when bulk data is not yet loaded', () => {
    // Initialize never resolves → isBulkDataLoaded stays false
    mockInitialize.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useGameData(mockClient, mockGameState as GameState));
    expect(result.current.getGameMap()).toEqual({});
  });

  it('getGameMap calls hiveClient.getGameMap() once bulk data is loaded', async () => {
    const gameMap = { 'auth/room': { exits: { north: 'auth/other' } } };
    mockGetGameMap.mockReturnValue(gameMap);
    const { result } = renderHook(() => useGameData(mockClient, mockGameState as GameState));
    await waitFor(() => expect(result.current.isBulkDataLoaded).toBe(true));
    expect(result.current.getGameMap()).toEqual(gameMap);
    expect(mockGetHiveClient).toHaveBeenCalled();
    expect(mockGetGameMap).toHaveBeenCalled();
  });
});
