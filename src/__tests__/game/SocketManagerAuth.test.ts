import { io } from 'socket.io-client';
import { SocketManager } from '../../game/network/SocketManager';
import { ChatAuth } from '../../game/network/ChatAuth';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

type Handler = (...args: any[]) => void;

const makeFakeSocket = () => {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    on: jest.fn((event: string, h: Handler) => { handlers.set(event, h); }),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    fire: (event: string, ...args: any[]) => handlers.get(event)?.(...args)
  };
};

const flush = () => new Promise((r) => setTimeout(r, 0));
const location = { author: 'raymonjohnstone', permlink: 'genesis-scaffold-precipice' };

describe('SocketManager chat login', () => {
  let sockets: ReturnType<typeof makeFakeSocket>[];
  let chatAuth: jest.Mocked<Pick<ChatAuth, 'prepare' | 'storeToken' | 'clearToken' | 'getStoredToken'>>;
  let manager: SocketManager;
  let statuses: any[];

  beforeEach(() => {
    sockets = [];
    (io as jest.Mock).mockImplementation(() => {
      const s = makeFakeSocket();
      sockets.push(s);
      return s;
    });
    chatAuth = {
      prepare: jest.fn(),
      storeToken: jest.fn(),
      clearToken: jest.fn(),
      getStoredToken: jest.fn()
    } as any;
    manager = new SocketManager({} as any, chatAuth as unknown as ChatAuth);
    statuses = [];
    manager.on('connectionStatusChanged', (s) => statuses.push(s));
  });

  afterEach(() => {
    manager.destroy();
    jest.clearAllMocks();
  });

  it('sends the signed login in the handshake and keeps ?username= for older servers', async () => {
    chatAuth.prepare.mockResolvedValue({ kind: 'auth', payload: { username: 'alice', challenge: 'c', signature: 's' } });
    manager.connect('alice', location);
    await flush();
    expect(io).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      query: { username: 'alice' },
      auth: { username: 'alice', challenge: 'c', signature: 's' }
    }));
  });

  it('stores the session token the server returns', async () => {
    chatAuth.prepare.mockResolvedValue({ kind: 'auth', payload: { username: 'alice', challenge: 'c', signature: 's' } });
    manager.connect('alice', location);
    await flush();
    sockets[0].fire('authenticated', { username: 'alice', sessionToken: 'tok' });
    expect(chatAuth.storeToken).toHaveBeenCalledWith('alice', 'tok');
  });

  it('connects without credentials against a server that has no chat login', async () => {
    chatAuth.prepare.mockResolvedValue({ kind: 'legacy' });
    manager.connect('alice', location);
    await flush();
    const opts = (io as jest.Mock).mock.calls[0][1];
    expect(opts.query).toEqual({ username: 'alice' });
    expect(opts.auth).toBeUndefined();
  });

  it('retries once with a fresh signature when the stored token is rejected', async () => {
    chatAuth.prepare
      .mockResolvedValueOnce({ kind: 'auth', payload: { username: 'alice', sessionToken: 'old' } })
      .mockResolvedValueOnce({ kind: 'auth', payload: { username: 'alice', challenge: 'c', signature: 's' } });
    manager.connect('alice', location);
    await flush();
    sockets[0].fire('connect_error', new Error('auth_failed: session expired'));
    await flush();
    expect(chatAuth.clearToken).toHaveBeenCalledWith('alice');
    expect(chatAuth.prepare).toHaveBeenLastCalledWith('alice', true);
    expect(sockets).toHaveLength(2);
  });

  it('stops instead of prompting Keychain again when a signature is rejected', async () => {
    chatAuth.prepare.mockResolvedValue({ kind: 'auth', payload: { username: 'alice', challenge: 'c', signature: 'bad' } });
    manager.connect('alice', location);
    await flush();
    sockets[0].fire('connect_error', new Error('auth_failed: signature does not match posting key'));
    await flush();
    expect(chatAuth.prepare).toHaveBeenCalledTimes(1);
    expect(statuses[statuses.length - 1]).toEqual({
      status: 'failed',
      error: 'Chat login failed (signature does not match posting key). Reload the page to try again.'
    });
  });

  it('explains a cancelled Keychain prompt when the server requires login', async () => {
    chatAuth.prepare.mockResolvedValue({ kind: 'cancelled' });
    manager.connect('alice', location);
    await flush();
    sockets[0].fire('connect_error', new Error('auth_failed: missing credentials'));
    await flush();
    expect(statuses[statuses.length - 1]).toEqual({
      status: 'failed',
      error: 'Chat needs you to sign in with Keychain. Reload the page to try again.'
    });
  });

  it('backs off and retries when the server is unreachable, without opening a socket', async () => {
    jest.useFakeTimers();
    try {
      chatAuth.prepare.mockResolvedValue({ kind: 'unreachable', error: 'Failed to fetch' });
      const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
      manager.connect('alice', location);
      await settle();
      expect(io).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1000);
      await settle();
      expect(chatAuth.prepare).toHaveBeenCalledTimes(2);
      // A second failure must schedule another retry (the timer is cleared after firing).
      jest.advanceTimersByTime(2000);
      await settle();
      expect(chatAuth.prepare).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops a login that finishes after disconnect', async () => {
    let resolve!: (v: any) => void;
    chatAuth.prepare.mockReturnValue(new Promise((r) => { resolve = r; }));
    manager.connect('alice', location);
    manager.disconnect();
    resolve({ kind: 'auth', payload: { username: 'alice', sessionToken: 't' } });
    await flush();
    expect(io).not.toHaveBeenCalled();
  });
  it('tells a guest that chat is unavailable instead of asking for Keychain', async () => {
    chatAuth.prepare.mockResolvedValue({ kind: 'auth', payload: { username: 'Guest-000001', sessionToken: 'old' } });
    manager.connect('Guest-000001', location);
    await flush();
    sockets[0].fire('connect_error', new Error('auth_failed: guest session expired'));
    await flush();
    expect(chatAuth.prepare).toHaveBeenCalledTimes(1);
    expect(statuses[statuses.length - 1]).toEqual({
      status: 'failed',
      error: 'Chat is not available for this guest right now. You can still look around.'
    });
  });

  it('does not store a guest token as a Hive chat session', async () => {
    chatAuth.prepare.mockResolvedValue({ kind: 'auth', payload: { username: 'Guest-000001', sessionToken: 'g' } });
    manager.connect('Guest-000001', location);
    await flush();
    sockets[0].fire('authenticated', { username: 'Guest-000001', sessionToken: 'g' });
    expect(chatAuth.storeToken).not.toHaveBeenCalled();
  });
});
