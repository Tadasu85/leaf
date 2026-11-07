import { Location } from '../types/GameTypes';

/**
 * A player's home room (LambdaMOO's @sethome / home).
 *
 * Hive players: egodeathplayer.home in their own posting_json_metadata.
 * Guests: this browser, per guest name.
 */

const isLocation = (value: unknown): value is Location =>
  Boolean(value && typeof value === 'object'
    && typeof (value as Location).author === 'string'
    && typeof (value as Location).permlink === 'string'
    && (value as Location).author.length > 0
    && (value as Location).permlink.length > 0);

/** Read the home saved on a Hive account (get_accounts result), if any. */
export const readHomeFromAccount = (account: { posting_json_metadata?: string } | null | undefined): Location | null => {
  try {
    const meta = account?.posting_json_metadata ? JSON.parse(account.posting_json_metadata) : null;
    const home = meta?.egodeathplayer?.home;
    return isLocation(home) ? { author: home.author, permlink: home.permlink } : null;
  } catch {
    return null;
  }
};

const guestKey = (username: string) => `leaf.home.${username}`;

export const loadGuestHome = (username: string): Location | null => {
  try {
    const raw = window.localStorage.getItem(guestKey(username));
    const home = raw ? JSON.parse(raw) : null;
    return isLocation(home) ? { author: home.author, permlink: home.permlink } : null;
  } catch {
    return null;
  }
};

export const saveGuestHome = (username: string, home: Location): void => {
  window.localStorage.setItem(guestKey(username), JSON.stringify({ author: home.author, permlink: home.permlink }));
};
