import { GameMap, Location } from '../types/GameTypes';

/**
 * The room map (game account → egodeathgamedata.rooms_authors_exits) has
 * always been keyed by permlink alone, with the author stored in the entry.
 * Two builders using the same permlink collide, so rooms can also be keyed
 * `author/permlink`, and exits can point at either form.
 *
 * Every read goes through these helpers so both forms work side by side:
 * today's map keeps working, and colliding rooms get the longer key.
 * (Hive account names can't contain "/", and neither can permlinks.)
 */

type Entry = GameMap[string];

export interface MapRoom extends Location {
  /** The key this room is stored under in the map. */
  key: string;
  entry: Entry;
}

export const fullKey = (author: string, permlink: string): string => `${author}/${permlink}`;

/** Author and permlink for a map key; legacy keys take the author from the entry. */
export function splitKey(key: string, entry?: { author?: string }): Location | null {
  const slash = key.indexOf('/');
  if (slash > 0 && slash < key.length - 1) {
    return { author: key.slice(0, slash), permlink: key.slice(slash + 1) };
  }
  if (slash !== -1 || !entry?.author) return null;
  return { author: entry.author, permlink: key };
}

/** The map entry for a room, under either key form. */
export function findRoom(map: GameMap, author: string, permlink: string): MapRoom | null {
  const longKey = fullKey(author, permlink);
  const long = map[longKey];
  if (long) return { key: longKey, author, permlink, entry: long };
  const legacy = map[permlink];
  if (legacy && legacy.author === author) return { key: permlink, author, permlink, entry: legacy };
  return null;
}

/** Where an exit leads. An exit holds a map key: `permlink` or `author/permlink`. */
export function resolveExit(map: GameMap, target: string): MapRoom | null {
  if (!target) return null;
  if (target.includes('/')) {
    const loc = splitKey(target);
    return loc ? findRoom(map, loc.author, loc.permlink) : null;
  }
  const entry = map[target];
  return entry?.author ? { key: target, author: entry.author, permlink: target, entry } : null;
}

/** Every room in the map with its author and permlink worked out. */
export function listRooms(map: GameMap): MapRoom[] {
  const out: MapRoom[] = [];
  for (const [key, entry] of Object.entries(map)) {
    const loc = splitKey(key, entry);
    if (loc) out.push({ key, ...loc, entry });
  }
  return out;
}

/**
 * The key a room should be written under: its existing key if it's on the
 * map, the short permlink key if that's free, otherwise `author/permlink`.
 */
export function keyForWrite(map: GameMap, author: string, permlink: string): string {
  const existing = findRoom(map, author, permlink);
  if (existing) return existing.key;
  return map[permlink] ? fullKey(author, permlink) : permlink;
}
