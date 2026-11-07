import config from '../../config';
import logger from '../../utils/Logger';
import { Location } from '../types/GameTypes';

/**
 * Guest play for people without a Hive account.
 *
 * The chat server hands out the guest name (Guest-123456) and a token for it.
 * Guests can't write to Hive, so their position is kept in this browser
 * instead of in move_to operations.
 */

export interface GuestIdentity {
  username: string;
  /** Missing when the chat server couldn't be reached; the guest can still explore. */
  sessionToken?: string;
  location?: Location;
}

const STORAGE_KEY = 'leaf.guest';
// Hive account names are lowercase only, so this can never match a real account.
const GUEST_RE = /^Guest-\d{6}$/;

export const isGuestName = (username: unknown): username is string =>
  typeof username === 'string' && GUEST_RE.test(username);

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const defaultStorage = (): Store | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export class GuestSession {
  private readonly storage: Store | null;
  private readonly fetchFn: typeof fetch;
  private readonly serverUrlOverride?: string;

  constructor(options: { storage?: Store | null; fetchFn?: typeof fetch; serverUrl?: string } = {}) {
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args));
    if (options.serverUrl) this.serverUrlOverride = options.serverUrl;
  }

  private get serverUrl(): string {
    return (this.serverUrlOverride ?? config.signalingServer ?? '').replace(/\/$/, '');
  }

  load(): GuestIdentity | null {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as GuestIdentity;
      if (!isGuestName(parsed?.username)) return null;
      const location = parsed.location;
      const validLocation = location && typeof location.author === 'string' && typeof location.permlink === 'string'
        ? { author: location.author, permlink: location.permlink }
        : undefined;
      return {
        username: parsed.username,
        ...(typeof parsed.sessionToken === 'string' ? { sessionToken: parsed.sessionToken } : {}),
        ...(validLocation ? { location: validLocation } : {})
      };
    } catch {
      return null;
    }
  }

  private save(identity: GuestIdentity): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(identity));
    } catch {
      // Storage unavailable (private mode): the guest just starts fresh next visit.
    }
  }

  saveLocation(location: Location): void {
    const current = this.load();
    if (!current) return;
    this.save({ ...current, location: { author: location.author, permlink: location.permlink } });
  }

  getToken(username: string): string | null {
    const current = this.load();
    return current && current.username === username ? current.sessionToken ?? null : null;
  }

  clear(): void {
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  /**
   * Resume the guest saved in this browser, or get a new guest name from the
   * chat server. A saved guest without a token (server was down last time)
   * tries to get one now. If the server can't be reached, an offline guest is
   * made up locally: it can explore but not chat.
   */
  async start(): Promise<GuestIdentity> {
    const saved = this.load();
    if (saved?.sessionToken) return saved;

    const issued = await this.requestIdentity();
    if (issued) {
      const identity: GuestIdentity = { ...issued, ...(saved?.location ? { location: saved.location } : {}) };
      this.save(identity);
      return identity;
    }

    if (saved) return saved;
    const offline: GuestIdentity = {
      username: `Guest-${Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')}`
    };
    this.save(offline);
    return offline;
  }

  private async requestIdentity(): Promise<{ username: string; sessionToken: string } | null> {
    try {
      const response = await this.fetchFn(`${this.serverUrl}/auth/guest`);
      if (!response.ok) return null;
      const body = await response.json();
      if (isGuestName(body?.username) && typeof body?.sessionToken === 'string') {
        return { username: body.username, sessionToken: body.sessionToken };
      }
      return null;
    } catch (error) {
      logger.warn('[GuestSession] Could not get a guest name from the chat server:', error);
      return null;
    }
  }
}

export const guestSession = new GuestSession();
