import { renderHook, act, waitFor } from '@testing-library/react';
import { useUserProfile } from '../../hooks/useUserProfile';
import { GameState } from '../../game/state/GameState';
import { Client } from '@hiveio/dhive';

jest.mock('../../utils/Logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    game: { account: 'hive-109456' },
    builders: ['static-builder'],
    admins: ['admin-user'],
  },
}));

describe('useUserProfile', () => {
  let mockGetCommunity: jest.Mock;
  let mockDatabaseCall: jest.Mock;
  let mockClient: Partial<Client>;
  let mockSetBuilderStatus: jest.Mock;
  let mockGameState: Partial<GameState>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetCommunity = jest.fn().mockResolvedValue([{
      team: [
        ['community-builder', 'mod', 'Builder'],
        ['regular-user', 'member', 'Member'],
      ],
    }]);

    mockDatabaseCall = jest.fn().mockResolvedValue([{
      posting_json_metadata: JSON.stringify({
        profile: { profile_image: 'https://example.com/avatar.jpg' },
      }),
      json_metadata: '',
    }]);

    mockClient = {
      hivemind: { getCommunity: mockGetCommunity } as any,
      database: { call: mockDatabaseCall } as any,
    };

    mockSetBuilderStatus = jest.fn();
    mockGameState = { setBuilderStatus: mockSetBuilderStatus };
  });

  // ─── initial state ──────────────────────────────────────────────────────────

  it('starts with empty profile, isBuilder=false, isAdmin=false', () => {
    const { result } = renderHook(() => useUserProfile(null, null, null));
    expect(result.current.userProfileJSON).toEqual({});
    expect(result.current.isBuilder).toBe(false);
    expect(result.current.isAdmin).toBe(false);
  });

  // ─── player effect ───────────────────────────────────────────────────────────

  it('picks up isBuilder from the player object before community status is determined', () => {
    const player = { isBuilder: true, isAdmin: false };
    const { result } = renderHook(() => useUserProfile(null, player, null));
    expect(result.current.isBuilder).toBe(true);
  });

  it('picks up isAdmin from the player object', () => {
    const player = { isBuilder: false, isAdmin: true };
    const { result } = renderHook(() => useUserProfile(null, player, null));
    expect(result.current.isAdmin).toBe(true);
  });

  it('resets isBuilder and isAdmin when player becomes null', () => {
    let player: any = { isBuilder: true, isAdmin: true };
    const { result, rerender } = renderHook(
      ({ p }) => useUserProfile(null, p, null),
      { initialProps: { p: player } }
    );
    expect(result.current.isBuilder).toBe(true);
    rerender({ p: null });
    expect(result.current.isBuilder).toBe(false);
    expect(result.current.isAdmin).toBe(false);
  });

  // ─── updateUserProfile ───────────────────────────────────────────────────────

  it('clears profile when username is null', async () => {
    const { result } = renderHook(() =>
      useUserProfile(mockGameState as GameState, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile(null);
    });
    expect(result.current.userProfileJSON).toEqual({});
    expect(result.current.isBuilder).toBe(false);
    expect(result.current.isAdmin).toBe(false);
  });

  it('marks a community builder as isBuilder=true', async () => {
    const { result } = renderHook(() =>
      useUserProfile(mockGameState as GameState, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('community-builder');
    });
    expect(result.current.isBuilder).toBe(true);
    expect(mockSetBuilderStatus).toHaveBeenCalledWith(true);
  });

  it('marks a static config builder as isBuilder=true even with empty community team', async () => {
    mockGetCommunity.mockResolvedValue([{ team: [] }]);
    const { result } = renderHook(() =>
      useUserProfile(mockGameState as GameState, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('static-builder');
    });
    expect(result.current.isBuilder).toBe(true);
  });

  it('marks config admin as isAdmin=true', async () => {
    const { result } = renderHook(() =>
      useUserProfile(mockGameState as GameState, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('admin-user');
    });
    expect(result.current.isAdmin).toBe(true);
  });

  it('marks a regular user as neither builder nor admin', async () => {
    const { result } = renderHook(() =>
      useUserProfile(mockGameState as GameState, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('regular-user');
    });
    expect(result.current.isBuilder).toBe(false);
    expect(result.current.isAdmin).toBe(false);
  });

  it('fetches and stores profile_image from posting_json_metadata', async () => {
    const { result } = renderHook(() =>
      useUserProfile(null, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('alice');
    });
    expect(result.current.userProfileJSON.profile_image).toBe('https://example.com/avatar.jpg');
  });

  it('falls back to json_metadata for profile image if posting_json_metadata has none', async () => {
    mockDatabaseCall.mockResolvedValue([{
      posting_json_metadata: '',
      json_metadata: JSON.stringify({ profile: { profile_image: 'https://example.com/fallback.jpg' } }),
    }]);
    const { result } = renderHook(() =>
      useUserProfile(null, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('alice');
    });
    expect(result.current.userProfileJSON.profile_image).toBe('https://example.com/fallback.jpg');
  });

  it('handles getCommunity returning a plain object (not array)', async () => {
    mockGetCommunity.mockResolvedValue({
      team: [['community-builder', 'mod', 'Builder']],
    });
    const { result } = renderHook(() =>
      useUserProfile(mockGameState as GameState, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('community-builder');
    });
    expect(result.current.isBuilder).toBe(true);
  });

  it('handles getCommunity error gracefully and falls back to config builders', async () => {
    mockGetCommunity.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() =>
      useUserProfile(mockGameState as GameState, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('static-builder');
    });
    expect(result.current.isBuilder).toBe(true);
  });

  it('handles database profile fetch error gracefully', async () => {
    mockDatabaseCall.mockRejectedValue(new Error('db error'));
    const { result } = renderHook(() =>
      useUserProfile(null, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('alice');
    });
    // profile_image falls to undefined on error
    expect(result.current.userProfileJSON.profile_image).toBeUndefined();
  });

  it('calls gameState.setBuilderStatus when available', async () => {
    const { result } = renderHook(() =>
      useUserProfile(mockGameState as GameState, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('community-builder');
    });
    expect(mockSetBuilderStatus).toHaveBeenCalledWith(true);
  });

  it('does not call gameState.setBuilderStatus when gameState is null', async () => {
    const { result } = renderHook(() =>
      useUserProfile(null, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('community-builder');
    });
    expect(mockSetBuilderStatus).not.toHaveBeenCalled();
  });

  // ─── hasPermission ────────────────────────────────────────────────────────────

  it('hasPermission returns true for admin for any permission type', () => {
    const player = { isBuilder: false, isAdmin: true };
    const { result } = renderHook(() => useUserProfile(null, player, null));
    expect(result.current.hasPermission('builder')).toBe(true);
    expect(result.current.hasPermission('anything')).toBe(true);
  });

  it('hasPermission("builder") returns true when isBuilder', () => {
    const player = { isBuilder: true, isAdmin: false };
    const { result } = renderHook(() => useUserProfile(null, player, null));
    expect(result.current.hasPermission('builder')).toBe(true);
  });

  it('hasPermission returns false for non-builder non-admin user', () => {
    const { result } = renderHook(() => useUserProfile(null, null, null));
    expect(result.current.hasPermission('builder')).toBe(false);
    expect(result.current.hasPermission('anything')).toBe(false);
  });

  // ─── checkIfUserIsBuilder ─────────────────────────────────────────────────────

  it('checkIfUserIsBuilder returns false before builders list is fetched', () => {
    const { result } = renderHook(() => useUserProfile(null, null, null));
    expect(result.current.checkIfUserIsBuilder('community-builder')).toBe(false);
  });

  it('checkIfUserIsBuilder returns true after builders list is populated', async () => {
    const { result } = renderHook(() =>
      useUserProfile(mockGameState as GameState, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('community-builder');
    });
    expect(result.current.checkIfUserIsBuilder('community-builder')).toBe(true);
  });

  it('checkIfUserIsBuilder returns false for a non-builder after list is loaded', async () => {
    const { result } = renderHook(() =>
      useUserProfile(mockGameState as GameState, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('community-builder');
    });
    expect(result.current.checkIfUserIsBuilder('regular-user')).toBe(false);
  });

  // ─── updateBuilderStatus ──────────────────────────────────────────────────────

  it('updateBuilderStatus sets isBuilder and notifies gameState', () => {
    const { result } = renderHook(() =>
      useUserProfile(mockGameState as GameState, null, null)
    );
    act(() => { result.current.updateBuilderStatus(true); });
    expect(result.current.isBuilder).toBe(true);
    expect(mockSetBuilderStatus).toHaveBeenCalledWith(true);
  });

  it('updateBuilderStatus works without gameState', () => {
    const { result } = renderHook(() => useUserProfile(null, null, null));
    act(() => { result.current.updateBuilderStatus(true); });
    expect(result.current.isBuilder).toBe(true);
  });

  // ─── updateAdminStatus ────────────────────────────────────────────────────────

  it('updateAdminStatus sets isAdmin', () => {
    const { result } = renderHook(() => useUserProfile(null, null, null));
    act(() => { result.current.updateAdminStatus(true); });
    expect(result.current.isAdmin).toBe(true);
  });

  // ─── getUserProfile ───────────────────────────────────────────────────────────

  it('getUserProfile returns current userProfileJSON', () => {
    const { result } = renderHook(() => useUserProfile(null, null, null));
    expect(result.current.getUserProfile()).toEqual({});
  });

  it('getUserProfile reflects updates after updateUserProfile', async () => {
    const { result } = renderHook(() =>
      useUserProfile(null, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.updateUserProfile('alice');
    });
    expect(result.current.getUserProfile().profile_image).toBe('https://example.com/avatar.jpg');
  });

  // ─── fetchBuildersList ────────────────────────────────────────────────────────

  it('fetchBuildersList does nothing when client is null', async () => {
    const { result } = renderHook(() => useUserProfile(null, null, null));
    await act(async () => {
      await result.current.fetchBuildersList();
    });
    // No error thrown, checkIfUserIsBuilder still returns false
    expect(result.current.checkIfUserIsBuilder('community-builder')).toBe(false);
  });

  it('fetchBuildersList populates the builders ref', async () => {
    const { result } = renderHook(() =>
      useUserProfile(null, null, mockClient as Client)
    );
    await act(async () => {
      await result.current.fetchBuildersList();
    });
    expect(result.current.checkIfUserIsBuilder('community-builder')).toBe(true);
  });
});
