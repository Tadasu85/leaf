/**
 * Room changes that come from the Leaf verbs contract. The contract keeps
 * each room's flags; a flag named `exit:<direction>` is an exit whose value
 * is the map key it leads to (empty = closed). Clients turn those flags into
 * exits on the room they show, so a lever one player pulls opens the way for
 * everyone.
 */
import type { RoomData } from '../types/GameTypes';

export type VerbEffect =
  | { type: 'SetExit'; direction: string; target: string }
  | { type: 'ClearExit'; direction: string };

/** What `use` returns (contract kernel.Result). */
export interface VerbOutcome {
  ok: boolean;
  self: string;
  others?: string;
  effects: VerbEffect[];
  flags: Record<string, string>;
}

const DIRECTION = /^[a-z]{1,12}$/;
const TARGET = /^([a-z][a-z0-9.-]{2,15}\/)?[a-z0-9-]{1,255}$/;
export const MAX_EFFECTS = 8;

/** Keep only well-formed effects, at most MAX_EFFECTS. */
export function cleanEffects(raw: unknown): VerbEffect[] {
  if (!Array.isArray(raw)) return [];
  const out: VerbEffect[] = [];
  for (const e of raw) {
    if (out.length >= MAX_EFFECTS) break;
    if (!e || typeof e !== 'object') continue;
    const { type, direction, target } = e as Record<string, unknown>;
    if (typeof direction !== 'string' || !DIRECTION.test(direction)) continue;
    if (type === 'ClearExit') out.push({ type, direction });
    else if (type === 'SetExit' && typeof target === 'string' && TARGET.test(target)) {
      out.push({ type, direction, target });
    }
  }
  return out;
}

/** Exit effects described by a room's flags (open exits only). */
export function effectsFromFlags(flags: Record<string, string> | null | undefined): VerbEffect[] {
  if (!flags) return [];
  const effects = Object.entries(flags)
    .filter(([k]) => k.startsWith('exit:'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({ type: 'SetExit', direction: k.slice(5), target: v }));
  return cleanEffects(effects);
}

/**
 * The room with effects applied. Returns a new object; the room's own exits
 * from the map are never removed, only exits opened by the contract
 * (`contractExits`) can be closed again.
 */
export function applyVerbEffects(
  room: RoomData,
  effects: VerbEffect[],
  contractExits: Set<string> = new Set(),
): { room: RoomData; contractExits: Set<string> } {
  const exits = { ...room.exits };
  const opened = new Set(contractExits);
  for (const e of effects) {
    if (e.type === 'SetExit') {
      if (exits[e.direction] !== undefined && !opened.has(e.direction)) continue; // a map exit wins
      exits[e.direction] = e.target;
      opened.add(e.direction);
    } else if (opened.has(e.direction)) {
      delete exits[e.direction];
      opened.delete(e.direction);
    }
  }
  return { room: { ...room, exits }, contractExits: opened };
}
