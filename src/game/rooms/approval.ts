import { GameMap, Location } from '../types/GameTypes';
import { findRoom, keyForWrite } from './mapKeys';

export interface ApprovalRequest {
  /** The room the new one connects from. */
  room: Location;
  newRoom: Location;
  exits: {
    /** direction → permlink of `room` (the way back). */
    fromNewRoom: Record<string, string>;
    /** direction → permlink of `newRoom`. */
    fromCurrentRoom: Record<string, string>;
  };
  timeEvent?: any;
}

export type ApprovalResult =
  | { ok: true; rooms: GameMap; newKey: string }
  | { ok: false; reason: string };

/**
 * The room map after approving one build request, or why it can't be.
 *
 * - The new room goes under its permlink if no one else uses it, otherwise
 *   under `author/permlink`, so it never replaces another author's room.
 * - Exits between the two rooms point at whichever key each is stored under.
 * - A room already on the map is never overwritten.
 * - The source room keeps every field it had (exits, timeEvent, …).
 */
export function applyApproval(current: GameMap, request: ApprovalRequest, approvalBlock: number): ApprovalResult {
  const { room, newRoom } = request;
  if (findRoom(current, newRoom.author, newRoom.permlink)) {
    return { ok: false, reason: `${newRoom.author}/${newRoom.permlink} is already on the map` };
  }
  const newKey = keyForWrite(current, newRoom.author, newRoom.permlink);
  const source = findRoom(current, room.author, room.permlink);
  const sourceKey = source?.key ?? keyForWrite(current, room.author, room.permlink);

  // Exits name rooms by permlink in the request; point them at the real keys.
  const retarget = (exits: Record<string, string>) =>
    Object.fromEntries(Object.entries(exits || {}).map(([dir, target]) => [
      dir,
      target === newRoom.permlink ? newKey : target === room.permlink ? sourceKey : target,
    ]));

  const newEntry: GameMap[string] = {
    author: newRoom.author,
    exits: retarget(request.exits.fromNewRoom),
  };
  if (request.timeEvent) {
    newEntry.timeEvent = { ...request.timeEvent, startBlock: request.timeEvent.startBlock || approvalBlock };
  }

  const rooms: GameMap = { ...current, [newKey]: newEntry };
  const existing = source?.entry;
  rooms[sourceKey] = {
    ...(existing || {}),
    author: existing?.author || room.author,
    exits: { ...(existing?.exits || {}), ...retarget(request.exits.fromCurrentRoom) },
  };
  return { ok: true, rooms, newKey };
}
