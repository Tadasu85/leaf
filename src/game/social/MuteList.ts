/**
 * Mutes for Leaf.
 *
 * A Hive player's own mute list on chain (follow "ignore") is the source of
 * truth: the chat server already hides muted players' chat, emotes and
 * presence. `mute` for a Hive player writes to that list through Keychain.
 *
 * Mutes that can't live on Hive (muting a guest, or a guest muting anyone)
 * are kept in this browser, per viewer. Hive mutes made in this session are
 * also hidden right away, because the chain and the server's cache take a
 * little while to catch up.
 */

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const storageKey = (viewer: string) => `leaf.mutes.${viewer}`;
const norm = (name: string) => name.trim().toLowerCase();

const defaultStorage = (): Store | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export class MuteList {
  private local: Set<string> = new Set();
  private sessionHive: Set<string> = new Set();
  private viewer: string | null = null;
  private readonly storage: Store | null;

  constructor(storage?: Store | null) {
    this.storage = storage === undefined ? defaultStorage() : storage;
  }

  /** Load the list for the player who is now logged in. */
  setViewer(viewer: string | null): void {
    this.viewer = viewer;
    this.sessionHive.clear();
    this.local = new Set();
    if (!viewer) return;
    try {
      const raw = this.storage?.getItem(storageKey(viewer));
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        for (const name of parsed) if (typeof name === 'string') this.local.add(norm(name));
      }
    } catch {
      // Corrupt or unavailable storage: start empty.
    }
  }

  private save(): void {
    if (!this.viewer) return;
    try {
      this.storage?.setItem(storageKey(this.viewer), JSON.stringify([...this.local]));
    } catch {
      // Storage unavailable: the mute lasts for this session only.
    }
  }

  addLocal(name: string): void {
    this.local.add(norm(name));
    this.save();
  }

  removeLocal(name: string): boolean {
    const removed = this.local.delete(norm(name));
    if (removed) this.save();
    return removed;
  }

  /** A Hive mute made this session, hidden until the server catches up. */
  addSessionHive(name: string): void {
    this.sessionHive.add(norm(name));
  }

  removeSessionHive(name: string): void {
    this.sessionHive.delete(norm(name));
  }

  isLocallyMuted(name: string): boolean {
    return this.local.has(norm(name));
  }

  /** Should this player's chat, emotes and presence be hidden here? */
  isMuted(name: string | undefined | null): boolean {
    if (!name) return false;
    const key = norm(name);
    return this.local.has(key) || this.sessionHive.has(key);
  }

  localNames(): string[] {
    return [...this.local].sort();
  }
}
