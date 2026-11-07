import logger from '../../utils/Logger';
import { guestSession, isGuestName } from '../guest/GuestSession';

/**
 * Chat login: proves to the chat server that this player owns their Hive
 * account. The server hands out a one-time challenge, Keychain signs it with
 * the posting key, and the server returns a session token that is reused for
 * reconnects (so Keychain only prompts once every few days).
 *
 * See Leaf-Server README, "Chat login".
 */

export interface ChatAuthPayload {
  username: string;
  sessionToken?: string;
  challenge?: string;
  signature?: string;
}

export type ChatSigner = (username: string, message: string) => Promise<string | null>;

export interface ChatAuthDeps {
  serverUrl: string;
  signer: ChatSigner;
  fetchFn?: typeof fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  guestTokens?: { getToken(username: string): string | null };
}

export type ChatAuthOutcome =
  | { kind: 'auth'; payload: ChatAuthPayload }
  /** Server predates chat login: connect the old way. */
  | { kind: 'legacy' }
  /** Player cancelled the Keychain prompt or Keychain can't sign. */
  | { kind: 'cancelled' }
  /** Server unreachable (e.g. Render cold start): retry later. */
  | { kind: 'unreachable'; error: string };

const tokenKey = (username: string) => `leaf.chatSession.${username}`;

const defaultStorage = (): ChatAuthDeps['storage'] => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export class ChatAuth {
  private readonly fetchFn: typeof fetch;
  private readonly storage: ChatAuthDeps['storage'];

  constructor(private deps: ChatAuthDeps) {
    this.fetchFn = deps.fetchFn ?? ((...args) => fetch(...args));
    this.storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  }

  getStoredToken(username: string): string | null {
    try {
      return this.storage?.getItem(tokenKey(username)) ?? null;
    } catch {
      return null;
    }
  }

  storeToken(username: string, token: string): void {
    try {
      this.storage?.setItem(tokenKey(username), token);
    } catch {
      // Storage can be unavailable (private mode); the player just signs again next time.
    }
  }

  clearToken(username: string): void {
    try {
      this.storage?.removeItem(tokenKey(username));
    } catch {
      // ignore
    }
  }

  /**
   * Work out what to send in the socket handshake. Uses a stored session
   * token when there is one, unless `forceSignature` is set (after the server
   * rejected the token).
   */
  async prepare(username: string, forceSignature = false): Promise<ChatAuthOutcome> {
    // Guests can't sign; they log in with the token the server gave them.
    if (isGuestName(username)) {
      const token = (this.deps.guestTokens ?? guestSession).getToken(username);
      return token ? { kind: 'auth', payload: { username, sessionToken: token } } : { kind: 'cancelled' };
    }
    if (!forceSignature) {
      const token = this.getStoredToken(username);
      if (token) return { kind: 'auth', payload: { username, sessionToken: token } };
    }

    let response: Response;
    try {
      const url = `${this.deps.serverUrl.replace(/\/$/, '')}/auth/challenge?username=${encodeURIComponent(username)}`;
      response = await this.fetchFn(url);
    } catch (error) {
      return { kind: 'unreachable', error: error instanceof Error ? error.message : String(error) };
    }

    if (response.status === 404) {
      logger.info('[ChatAuth] Server has no chat login yet; connecting without it');
      return { kind: 'legacy' };
    }
    if (!response.ok) {
      return { kind: 'unreachable', error: `challenge request failed (${response.status})` };
    }

    let body: { challenge?: unknown; mode?: unknown };
    try {
      body = await response.json();
    } catch {
      return { kind: 'unreachable', error: 'bad challenge response' };
    }
    if (body.mode === 'off') return { kind: 'legacy' };
    if (typeof body.challenge !== 'string') {
      return { kind: 'unreachable', error: 'bad challenge response' };
    }

    const signature = await this.deps.signer(username, body.challenge);
    if (!signature) return { kind: 'cancelled' };
    return { kind: 'auth', payload: { username, challenge: body.challenge, signature } };
  }
}

/** Server rejected the handshake because of the login, not a network problem. */
export const isAuthError = (message: unknown): message is string =>
  typeof message === 'string' && message.startsWith('auth_failed:');
