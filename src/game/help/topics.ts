/**
 * help <topic>: short guides grouped by what players want to do, like
 * LambdaMOO's help index. Plain `help` still lists every command; these
 * explain how things fit together. Written for the full set of commands
 * (some arrive with separate PRs).
 */

export interface HelpTopic {
  title: string;
  lines: string[];
}

export const HELP_TOPICS: Record<string, HelpTopic> = {
  moving: {
    title: 'Moving around',
    lines: [
      'Type an exit to go through it: north, south, east, west, up, down, or whatever the room lists.',
      'Some rooms change over time (a ferry that comes and goes); their exits change with them.',
      "sethome makes the room you're in your home; home takes you back there from anywhere.",
      'As a Hive player, each move is saved on Hive through Keychain so you start where you left off.'
    ]
  },
  talking: {
    title: 'Talking to people',
    lines: [
      'say <message> - everyone in the room hears it.',
      'emote <action> - "emote waves" shows "alice waves" to the room.',
      'whisper <player> <message> - only that player hears it; they must be in the room.',
      'page <player> <message> - reach someone online anywhere in the world.',
      'who - see who is online.',
      'Pages and whispers go through the chat server and are never written to Hive.'
    ]
  },
  looking: {
    title: 'Looking around',
    lines: [
      'look - the room again.',
      "look <thing> - a detail the room's author wrote, e.g. look bell.",
      "look <player> - someone's description; look self for yours.",
      '@describe <text> and @describeshort <text> set your description (saved on Hive).'
    ]
  },
  people: {
    title: 'Muting and moderation',
    lines: [
      "mute <player> - stop seeing someone's chat, emotes and comings and goings. For Hive players it goes on your Hive mute list, so it applies across Hive.",
      'unmute <player> - see them again. muted - list everyone you have muted.',
      'eject <player> - in a room you built, remove someone for 10 minutes. They are sent to the start room.'
    ]
  },
  building: {
    title: 'Building rooms',
    lines: [
      'Builders (a title earned by exploring) can open the Build window to add a room off the one they are in.',
      'New rooms wait in the admin Queue until approved; you can have 3 waiting at once.',
      'Edit Room lets you change your rooms: title, description, and lines shown when people use each exit (%n is their name).',
      'Comments you write on your room post in the form "key: text" become things people can look at.',
      "typo, bug and idea <note> send feedback to a room's author as a Hive comment."
    ]
  },
  guests: {
    title: 'Playing as a guest',
    lines: [
      "Type guest on the welcome screen to look around and chat without a Hive account. Your place is kept in this browser.",
      "Guests can't build, set descriptions or send room feedback.",
      'signup - how to get a Hive account. When you log in with it, you start where your guest left off.'
    ]
  }
};

const ALIASES: Record<string, string> = {
  move: 'moving', movement: 'moving', exits: 'moving', home: 'moving', sethome: 'moving',
  talk: 'talking', chat: 'talking', say: 'talking', emote: 'talking', page: 'talking', whisper: 'talking', who: 'talking',
  look: 'looking', describe: 'looking', '@describe': 'looking', details: 'looking',
  mute: 'people', unmute: 'people', muted: 'people', eject: 'people', moderation: 'people',
  build: 'building', builder: 'building', builders: 'building', rooms: 'building', edit: 'building', feedback: 'building', typo: 'building', bug: 'building', idea: 'building',
  guest: 'guests', signup: 'guests', account: 'guests'
};

export const TOPIC_NAMES = Object.keys(HELP_TOPICS);

export const findHelpTopic = (name: string): HelpTopic | null => {
  const key = name.trim().toLowerCase();
  return HELP_TOPICS[key] ?? HELP_TOPICS[ALIASES[key] ?? ''] ?? null;
};

export const helpIndexLine = (): string => `For more, type help <topic>. Topics: ${TOPIC_NAMES.join(', ')}.`;
