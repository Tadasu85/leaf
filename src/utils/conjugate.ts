const IRREGULARS: Record<string, string> = {
  be: 'is',
  have: 'has',
  do: 'does',
  go: 'goes',
};

const IRREGULAR_REVERSE: Record<string, string> = {
  is: 'be',
  has: 'have',
  does: 'do',
  goes: 'go',
};

function toBaseForm(verb: string): string {
  const lower = verb.toLowerCase();
  if (IRREGULAR_REVERSE[lower]) return IRREGULAR_REVERSE[lower];
  if (/ies$/i.test(verb)) return verb.slice(0, -3) + 'y';
  if (/([sxz]|[sc]h)es$/i.test(verb)) return verb.slice(0, -2);
  if (/es$/i.test(verb)) return verb.slice(0, -1);
  if (/s$/i.test(verb)) return verb.slice(0, -1);
  return verb;
}

function toThirdPerson(verb: string): string {
  const lower = verb.toLowerCase();
  if (IRREGULARS[lower]) return IRREGULARS[lower];
  if (/[sxz]$|[sc]h$/i.test(verb)) return verb + 'es';
  if (/[^aeiou]y$/i.test(verb)) return verb.slice(0, -1) + 'ies';
  return verb + 's';
}

export function conjugateEmoteForSender(emote: string): string {
  if (!emote) return emote;
  const words = emote.split(' ');
  words[0] = toBaseForm(words[0]);
  return words.join(' ');
}

export function conjugateEmoteForOthers(emote: string): string {
  if (!emote) return emote;
  const words = emote.split(' ');
  words[0] = toThirdPerson(toBaseForm(words[0]));
  return words.join(' ');
}
