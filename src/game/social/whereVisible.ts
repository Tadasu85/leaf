/**
 * `where on` / `where off`: whether `who` shows which room this player is
 * in. Off by default. The choice is kept in this browser, per player, and
 * sent to the chat server on every connect; the server forgets it when the
 * player disconnects.
 */
const key = (username: string) => `leaf.where.${username.toLowerCase()}`;

export function loadWhereVisible(username: string | null | undefined): boolean {
  if (!username) return false;
  try {
    return window.localStorage.getItem(key(username)) === 'on';
  } catch {
    return false;
  }
}

export function saveWhereVisible(username: string, visible: boolean): void {
  try {
    if (visible) window.localStorage.setItem(key(username), 'on');
    else window.localStorage.removeItem(key(username));
  } catch {
    // storage blocked: the choice lasts for this connection only
  }
}

/** "the Deep Cavern" from a cached title, else the permlink made readable. */
export function describeLocation(channelId: string, titleOf?: (author: string, permlink: string) => string | undefined): string {
  const slash = channelId.indexOf('/');
  const author = slash > 0 ? channelId.slice(0, slash) : '';
  const permlink = slash > 0 ? channelId.slice(slash + 1) : channelId;
  const title = author ? titleOf?.(author, permlink) : undefined;
  return title || permlink.replace(/-/g, ' ');
}
