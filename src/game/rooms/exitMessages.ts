/**
 * Exit messages: optional lines a room's author sets on the room's exits,
 * borrowed from LambdaMOO. They live in the room post's json_metadata:
 *
 *   exitMessages: { north: { leave: "You climb the ladder.", arrive: "..." } }
 *
 * `leave` is shown to the player as they go through the exit, `arrive` after
 * the next room appears. `othersLeave` is shown to the others in the room
 * being left and `othersArrive` to those in the room being entered (the
 * chat server only says which exit was used; each client looks the line up
 * here, so players can't inject their own text). `%n` is the player's name.
 */

import { ExitMessage } from '../types/GameTypes';

export const MAX_EXIT_MESSAGE_LENGTH = 200;
const DIRECTION_RE = /^[a-z][a-z0-9-]{0,19}$/;

const clean = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, MAX_EXIT_MESSAGE_LENGTH);
  return text || undefined;
};

const FIELDS: (keyof ExitMessage)[] = ['leave', 'arrive', 'othersLeave', 'othersArrive'];

const pick = (value: unknown): ExitMessage | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const result: ExitMessage = {};
  for (const field of FIELDS) {
    const text = clean((value as ExitMessage)[field]);
    if (text) result[field] = text;
  }
  return Object.keys(result).length ? result : undefined;
};

/** Read exitMessages from a post's json_metadata, dropping anything malformed. */
export const parseExitMessages = (jsonMetadata: unknown): Record<string, ExitMessage> | undefined => {
  let meta: unknown = jsonMetadata;
  if (typeof jsonMetadata === 'string') {
    try {
      meta = jsonMetadata ? JSON.parse(jsonMetadata) : null;
    } catch {
      return undefined;
    }
  }
  const raw = meta && typeof meta === 'object' ? (meta as { exitMessages?: unknown }).exitMessages : undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: Record<string, ExitMessage> = {};
  for (const [direction, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!DIRECTION_RE.test(direction)) continue;
    const message = pick(value);
    if (message) result[direction] = message;
  }
  return Object.keys(result).length ? result : undefined;
};

/** Tidy messages from the Edit Room form: only exits the room has, only non-empty texts. */
export const buildExitMessages = (
  exits: string[],
  values: Record<string, ExitMessage>
): Record<string, ExitMessage> => {
  const result: Record<string, ExitMessage> = {};
  for (const direction of exits) {
    const message = pick(values[direction]);
    if (message) result[direction] = message;
  }
  return result;
};

/** Fill in %n (the player's name); %% is a literal percent sign. */
export const renderExitMessage = (template: string, playerName: string): string =>
  template.replace(/%(%|n|N)/g, (_match, code: string) => (code === '%' ? '%' : playerName));
