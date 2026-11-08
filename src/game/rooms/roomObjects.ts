/**
 * Simple interactive objects, borrowed from LambdaMOO's objects with verbs,
 * but as data only: a room's author writes what happens, and nothing is
 * executed. Stored in the room post's json_metadata:
 *
 *   objects: { bell: { ring: { self: "You ring the bell.", others: "%n rings the bell." } } }
 *
 * Players type `ring bell` (or `ring the bell`). They see `self`; others in
 * the room see `others`, looked up by each client from the room post, so a
 * player can only trigger lines the author wrote. `%n` is the player's name.
 *
 * In Edit Room the author writes one per line:
 *   ring bell: You ring the bell. | %n rings the bell.
 *
 * A line starting with `*` marks an action that runs on the Leaf verbs
 * contract on VSC (`vsc: true`): the line shown is what the player sees
 * while the chain works it out, and the contract's own text and room flags
 * (an exit opening, say) follow. See src/game/verbs.
 *   *pull lever: You reach for the lever.
 */

export interface ObjectAction {
  self: string;
  others?: string;
  /** Runs on the VSC verbs contract; `self` is the line shown meanwhile. */
  vsc?: true;
}

/** object name -> verb -> action */
export type RoomObjects = Record<string, Record<string, ObjectAction>>;

export const MAX_OBJECT_TEXT_LENGTH = 200;
export const MAX_OBJECT_ACTIONS = 30;
const NAME_RE = /^[a-z][a-z0-9 -]{0,29}$/;
const VERB_RE = /^[a-z]{2,15}$/;
const ARTICLES = new Set(['the', 'a', 'an']);

const clean = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, MAX_OBJECT_TEXT_LENGTH);
  return text || undefined;
};

const normName = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase();

/** Read objects from a post's json_metadata, dropping anything malformed. */
export const parseRoomObjects = (jsonMetadata: unknown): RoomObjects | undefined => {
  let meta: unknown = jsonMetadata;
  if (typeof jsonMetadata === 'string') {
    try {
      meta = jsonMetadata ? JSON.parse(jsonMetadata) : null;
    } catch {
      return undefined;
    }
  }
  const raw = meta && typeof meta === 'object' ? (meta as { objects?: unknown }).objects : undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: RoomObjects = {};
  let count = 0;
  for (const [rawName, verbs] of Object.entries(raw as Record<string, unknown>)) {
    const name = normName(rawName);
    if (!NAME_RE.test(name) || !verbs || typeof verbs !== 'object') continue;
    for (const [verb, action] of Object.entries(verbs as Record<string, unknown>)) {
      if (!VERB_RE.test(verb) || !action || typeof action !== 'object' || count >= MAX_OBJECT_ACTIONS) continue;
      const self = clean((action as ObjectAction).self);
      if (!self) continue;
      const others = clean((action as ObjectAction).others);
      const vsc = (action as ObjectAction).vsc === true;
      result[name] = { ...result[name], [verb]: { self, ...(others ? { others } : {}), ...(vsc ? { vsc: true as const } : {}) } };
      count++;
    }
  }
  return Object.keys(result).length ? result : undefined;
};

/** Match "ring bell" / "ring the brass bell" against the room's objects. */
export const matchObjectAction = (
  objects: RoomObjects | undefined,
  input: string
): { object: string; verb: string; action: ObjectAction } | null => {
  if (!objects) return null;
  const words = input.trim().toLowerCase().split(/\s+/);
  const verb = words.shift();
  if (!verb || !VERB_RE.test(verb)) return null;
  const objectName = words.filter((w, i) => !(i === 0 && ARTICLES.has(w))).join(' ');
  const action = objects[objectName]?.[verb];
  return action ? { object: objectName, verb, action } : null;
};

/** The Edit Room text for a room's objects, one action per line. */
export const objectsToText = (objects: RoomObjects | undefined): string => {
  const lines: string[] = [];
  for (const [name, verbs] of Object.entries(objects ?? {})) {
    for (const [verb, action] of Object.entries(verbs)) {
      lines.push(`${action.vsc ? '*' : ''}${verb} ${name}: ${action.self}${action.others ? ` | ${action.others}` : ''}`);
    }
  }
  return lines.join('\n');
};

/** Parse the Edit Room text back. Returns the objects, or the first problem. */
export const textToObjects = (text: string): { objects: RoomObjects; error?: string } => {
  const objects: RoomObjects = {};
  let count = 0;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const [index, rawLine] of lines.entries()) {
    const vsc = rawLine.startsWith('*');
    const line = vsc ? rawLine.slice(1).trim() : rawLine;
    const colon = line.indexOf(':');
    const head = colon > 0 ? line.slice(0, colon).trim().toLowerCase().split(/\s+/) : [];
    const verb = head.shift() ?? '';
    const name = normName(head.join(' '));
    const [selfPart, othersPart] = colon > 0 ? line.slice(colon + 1).split('|') : [];
    const self = clean(selfPart);
    const problem = `Line ${index + 1}: write it like "ring bell: You ring the bell. | %n rings the bell."`;
    if (!VERB_RE.test(verb) || !NAME_RE.test(name) || !self) return { objects, error: problem };
    if (++count > MAX_OBJECT_ACTIONS) return { objects, error: `At most ${MAX_OBJECT_ACTIONS} actions per room.` };
    const others = clean(othersPart);
    objects[name] = { ...objects[name], [verb]: { self, ...(others ? { others } : {}), ...(vsc ? { vsc: true as const } : {}) } };
  }
  return { objects };
};

/** Fill in %n (the player's name); %% is a literal percent sign. */
export const renderObjectLine = (template: string, playerName: string): string =>
  template.replace(/%(%|n|N)/g, (_match, code: string) => (code === '%' ? '%' : playerName));
