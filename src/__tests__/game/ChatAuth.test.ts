import { ChatAuth, isAuthError } from '../../game/network/ChatAuth';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    data
  };
};

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('ChatAuth', () => {
  it('uses a stored session token without asking Keychain', async () => {
    const storage = memoryStorage();
    storage.setItem('leaf.chatSession.alice', 'tok');
    const signer = jest.fn();
    const fetchFn = jest.fn();
    const auth = new ChatAuth({ serverUrl: 'https://srv', signer, fetchFn: fetchFn as any, storage });
    await expect(auth.prepare('alice')).resolves.toEqual({ kind: 'auth', payload: { username: 'alice', sessionToken: 'tok' } });
    expect(signer).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetches a challenge and signs it with Keychain', async () => {
    const signer = jest.fn(async () => 'sig');
    const fetchFn = jest.fn(async () => jsonResponse(200, { challenge: 'leaf-chat-login:alice:n:1', mode: 'required' }));
    const auth = new ChatAuth({ serverUrl: 'https://srv/', signer, fetchFn: fetchFn as any, storage: memoryStorage() });
    await expect(auth.prepare('alice')).resolves.toEqual({
      kind: 'auth',
      payload: { username: 'alice', challenge: 'leaf-chat-login:alice:n:1', signature: 'sig' }
    });
    expect(fetchFn).toHaveBeenCalledWith('https://srv/auth/challenge?username=alice');
    expect(signer).toHaveBeenCalledWith('alice', 'leaf-chat-login:alice:n:1');
  });

  it('skips the stored token when a fresh signature is forced', async () => {
    const storage = memoryStorage();
    storage.setItem('leaf.chatSession.alice', 'stale');
    const signer = jest.fn(async () => 'sig');
    const fetchFn = jest.fn(async () => jsonResponse(200, { challenge: 'c', mode: 'required' }));
    const auth = new ChatAuth({ serverUrl: 'https://srv', signer, fetchFn: fetchFn as any, storage });
    const outcome = await auth.prepare('alice', true);
    expect(outcome).toEqual({ kind: 'auth', payload: { username: 'alice', challenge: 'c', signature: 'sig' } });
  });

  it('falls back to the old connection when the server has no chat login', async () => {
    const auth = new ChatAuth({
      serverUrl: 'https://srv',
      signer: jest.fn(),
      fetchFn: (async () => jsonResponse(404, {})) as any,
      storage: memoryStorage()
    });
    await expect(auth.prepare('alice')).resolves.toEqual({ kind: 'legacy' });
  });

  it('does not prompt Keychain when the server has chat login turned off', async () => {
    const signer = jest.fn();
    const auth = new ChatAuth({
      serverUrl: 'https://srv',
      signer,
      fetchFn: (async () => jsonResponse(200, { challenge: 'c', mode: 'off' })) as any,
      storage: memoryStorage()
    });
    await expect(auth.prepare('alice')).resolves.toEqual({ kind: 'legacy' });
    expect(signer).not.toHaveBeenCalled();
  });

  it('reports a cancelled Keychain prompt', async () => {
    const auth = new ChatAuth({
      serverUrl: 'https://srv',
      signer: async () => null,
      fetchFn: (async () => jsonResponse(200, { challenge: 'c', mode: 'required' })) as any,
      storage: memoryStorage()
    });
    await expect(auth.prepare('alice')).resolves.toEqual({ kind: 'cancelled' });
  });

  it('reports an unreachable server instead of prompting Keychain', async () => {
    const signer = jest.fn();
    const auth = new ChatAuth({
      serverUrl: 'https://srv',
      signer,
      fetchFn: (async () => { throw new Error('Failed to fetch'); }) as any,
      storage: memoryStorage()
    });
    await expect(auth.prepare('alice')).resolves.toEqual({ kind: 'unreachable', error: 'Failed to fetch' });
    expect(signer).not.toHaveBeenCalled();
  });

  it('treats a 5xx as unreachable', async () => {
    const auth = new ChatAuth({
      serverUrl: 'https://srv',
      signer: jest.fn(),
      fetchFn: (async () => jsonResponse(502, {})) as any,
      storage: memoryStorage()
    });
    await expect(auth.prepare('alice')).resolves.toMatchObject({ kind: 'unreachable' });
  });

  it('stores and clears tokens per user', () => {
    const storage = memoryStorage();
    const auth = new ChatAuth({ serverUrl: 'https://srv', signer: jest.fn(), storage });
    auth.storeToken('alice', 't1');
    expect(auth.getStoredToken('alice')).toBe('t1');
    expect(auth.getStoredToken('bob')).toBeNull();
    auth.clearToken('alice');
    expect(auth.getStoredToken('alice')).toBeNull();
  });

  it('works without storage', async () => {
    const auth = new ChatAuth({ serverUrl: 'https://srv', signer: async () => 'sig', storage: null,
      fetchFn: (async () => jsonResponse(200, { challenge: 'c', mode: 'required' })) as any });
    auth.storeToken('alice', 't');
    expect(auth.getStoredToken('alice')).toBeNull();
    await expect(auth.prepare('alice')).resolves.toMatchObject({ kind: 'auth' });
  });

  it('recognises server auth errors', () => {
    expect(isAuthError('auth_failed: session expired')).toBe(true);
    expect(isAuthError('xhr poll error')).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
  });
  it('logs guests in with their guest token and never asks Keychain', async () => {
    const signer = jest.fn();
    const fetchFn = jest.fn();
    const auth = new ChatAuth({ serverUrl: 'https://srv', signer, fetchFn: fetchFn as any, storage: memoryStorage(),
      guestTokens: { getToken: (u) => (u === 'Guest-000001' ? 'gtok' : null) } });
    await expect(auth.prepare('Guest-000001')).resolves.toEqual({ kind: 'auth', payload: { username: 'Guest-000001', sessionToken: 'gtok' } });
    await expect(auth.prepare('Guest-000001', true)).resolves.toMatchObject({ kind: 'auth' });
    await expect(auth.prepare('Guest-000002')).resolves.toEqual({ kind: 'cancelled' });
    expect(signer).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
