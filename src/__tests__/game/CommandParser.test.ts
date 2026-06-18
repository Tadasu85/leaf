import { CommandParser } from '../../game/commands/CommandParser';

describe('CommandParser', () => {
  let parser: CommandParser;

  beforeEach(() => {
    jest.useFakeTimers();
    parser = new CommandParser();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Input validation ─────────────────────────────────────────────────────

  describe('input validation', () => {
    it('returns null for empty string', () => {
      expect(parser.parse('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(parser.parse('   ')).toBeNull();
    });

    it('returns null when input exceeds 500 characters', () => {
      const input = 'say ' + 'a'.repeat(497);
      expect(input.length).toBeGreaterThan(500);
      expect(parser.parse(input)).toBeNull();
    });

    it('accepts input well within the 500-character limit', () => {
      // The 500-char gate is the outermost check; in practice the args limit (400)
      // and command limit (100) are hit first, so a valid in-bounds input is shorter.
      const input = 'say ' + 'a'.repeat(400); // 404 chars, args exactly at limit
      expect(input.length).toBeLessThan(500);
      const result = parser.parse(input);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('say');
    });

    it('returns null for input with disallowed characters (backtick)', () => {
      expect(parser.parse('say `hello`')).toBeNull();
    });

    it('returns null for input with disallowed characters (tilde)', () => {
      expect(parser.parse('say ~hello')).toBeNull();
    });

    it('returns null for input with disallowed characters (caret)', () => {
      expect(parser.parse('say ^hello')).toBeNull();
    });

    it('returns null for <script injection', () => {
      expect(parser.parse('say <script>alert(1)</script>')).toBeNull();
    });

    it('returns null for javascript: injection', () => {
      expect(parser.parse('say javascript:void(0)')).toBeNull();
    });

    it('returns null for on* event handler injection', () => {
      expect(parser.parse('say onclick=alert')).toBeNull();
    });

    it('returns null for data:text/html injection', () => {
      expect(parser.parse('say data:text/html,<h1>x</h1>')).toBeNull();
    });

    it('returns null for vbscript: injection', () => {
      expect(parser.parse('say vbscript:msgbox(1)')).toBeNull();
    });

    it('returns null for expression() injection', () => {
      expect(parser.parse('say expression(alert(1))')).toBeNull();
    });

    it('accepts input with allowed special characters', () => {
      const result = parser.parse("say hello, world! it's great.");
      expect(result).not.toBeNull();
      expect(result?.type).toBe('say');
    });

    it('accepts input with @, #, and punctuation', () => {
      const result = parser.parse('@describe a tall figure with dark eyes.');
      expect(result).not.toBeNull();
    });
  });

  // ─── Rate limiting ─────────────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('allows first command immediately', () => {
      expect(parser.parse('look')).not.toBeNull();
    });

    it('blocks second command within 100ms', () => {
      parser.parse('look');
      jest.advanceTimersByTime(50);
      expect(parser.parse('look')).toBeNull();
    });

    it('allows command after 100ms have elapsed', () => {
      parser.parse('look');
      jest.advanceTimersByTime(100);
      expect(parser.parse('look')).not.toBeNull();
    });

    it('blocks at 99ms and allows at 100ms', () => {
      parser.parse('look');
      jest.advanceTimersByTime(99);
      expect(parser.parse('look')).toBeNull();
      jest.advanceTimersByTime(1);
      expect(parser.parse('look')).not.toBeNull();
    });
  });

  // ─── Command length limits ──────────────────────────────────────────────────

  describe('command and arg length limits', () => {
    it('returns null when command word exceeds 100 characters', () => {
      const longCommand = 'a'.repeat(101);
      // Pass a matching exit so the only reason for null is command length
      expect(parser.parse(longCommand, { [longCommand]: 'room' })).toBeNull();
    });

    it('returns null when args exceed 400 characters', () => {
      const input = 'say ' + 'a'.repeat(401);
      expect(parser.parse(input)).toBeNull();
    });

    it('accepts args at exactly 400 characters', () => {
      const input = 'say ' + 'a'.repeat(400);
      const result = parser.parse(input);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('say');
    });
  });

  // ─── Result shape ──────────────────────────────────────────────────────────

  describe('result shape', () => {
    it('always includes a numeric timestamp', () => {
      const result = parser.parse('look');
      expect(typeof result?.timestamp).toBe('number');
    });

    it('timestamp is close to Date.now()', () => {
      const before = Date.now();
      const result = parser.parse('look');
      expect(result!.timestamp).toBeGreaterThanOrEqual(before);
    });
  });

  // ─── login ─────────────────────────────────────────────────────────────────

  describe('login command', () => {
    it('parses login with a valid username', () => {
      const result = parser.parse('login alice');
      expect(result).toEqual({ type: 'login', args: ['alice'], timestamp: expect.any(Number) });
    });

    it('parses login case-insensitively', () => {
      const result = parser.parse('LOGIN alice');
      expect(result?.type).toBe('login');
      expect(result?.args[0]).toBe('alice');
    });

    it('returns null for login with no username', () => {
      expect(parser.parse('login')).toBeNull();
    });

    it('joins multi-word usernames', () => {
      const result = parser.parse('login alice bob');
      expect(result?.args[0]).toBe('alice bob');
    });

    it('returns null for username with disallowed characters', () => {
      expect(parser.parse('login alice@example')).toBeNull();
    });

    it('returns null for username exceeding 50 characters', () => {
      const longName = 'a'.repeat(51);
      expect(parser.parse(`login ${longName}`)).toBeNull();
    });

    it('accepts username with hyphens and underscores', () => {
      const result = parser.parse('login alice_bob-123');
      expect(result?.type).toBe('login');
      expect(result?.args[0]).toBe('alice_bob-123');
    });
  });

  // ─── say ───────────────────────────────────────────────────────────────────

  describe('say command', () => {
    it('parses say with a message', () => {
      const result = parser.parse('say hello world');
      expect(result).toEqual({ type: 'say', args: ['hello world'], timestamp: expect.any(Number) });
    });

    it('parses say with no message (empty string)', () => {
      const result = parser.parse('say');
      expect(result?.type).toBe('say');
      expect(result?.args[0]).toBe('');
    });

    it('parses say case-insensitively', () => {
      expect(parser.parse('SAY hello')?.type).toBe('say');
    });

    it('preserves message with punctuation', () => {
      const result = parser.parse("say hello, how are you?");
      expect(result?.args[0]).toBe("hello, how are you?");
    });
  });

  // ─── emote ─────────────────────────────────────────────────────────────────

  describe('emote command', () => {
    it('parses emote with an action', () => {
      const result = parser.parse('emote waves hello');
      expect(result).toEqual({ type: 'emote', args: ['waves hello'], timestamp: expect.any(Number) });
    });

    it('parses emote with no action (empty string)', () => {
      const result = parser.parse('emote');
      expect(result?.type).toBe('emote');
      expect(result?.args[0]).toBe('');
    });

    it('parses emote case-insensitively', () => {
      expect(parser.parse('EMOTE waves')?.type).toBe('emote');
    });
  });

  // ─── look ──────────────────────────────────────────────────────────────────

  describe('look command', () => {
    it('parses bare look as room look', () => {
      const result = parser.parse('look');
      expect(result).toEqual({ type: 'look', args: [], timestamp: expect.any(Number) });
    });

    it('parses look <target> as lookAt', () => {
      const result = parser.parse('look self');
      expect(result).toEqual({ type: 'lookAt', args: ['self'], timestamp: expect.any(Number) });
    });

    it('parses look <player> as lookAt', () => {
      const result = parser.parse('look alice');
      expect(result?.type).toBe('lookAt');
      expect(result?.args[0]).toBe('alice');
    });

    it('joins multi-word look target', () => {
      const result = parser.parse('look stone pillar');
      expect(result?.type).toBe('lookAt');
      expect(result?.args[0]).toBe('stone pillar');
    });

    it('parses look case-insensitively', () => {
      expect(parser.parse('LOOK')?.type).toBe('look');
    });
  });

  // ─── help ──────────────────────────────────────────────────────────────────

  describe('help command', () => {
    it('parses help', () => {
      const result = parser.parse('help');
      expect(result).toEqual({ type: 'help', args: [], timestamp: expect.any(Number) });
    });

    it('parses help case-insensitively', () => {
      expect(parser.parse('HELP')?.type).toBe('help');
    });
  });

  // ─── @describe ─────────────────────────────────────────────────────────────

  describe('@describe command', () => {
    it('parses @describe with a description', () => {
      const result = parser.parse('@describe a tall hooded figure');
      expect(result).toEqual({ type: 'describe', args: ['a tall hooded figure'], timestamp: expect.any(Number) });
    });

    it('parses @describe with no description (empty string)', () => {
      const result = parser.parse('@describe');
      expect(result?.type).toBe('describe');
      expect(result?.args[0]).toBe('');
    });
  });

  // ─── @describeshort ────────────────────────────────────────────────────────

  describe('@describeshort command', () => {
    it('parses @describeshort with a description', () => {
      const result = parser.parse('@describeshort hooded figure');
      expect(result).toEqual({ type: 'describeshort', args: ['hooded figure'], timestamp: expect.any(Number) });
    });

    it('parses @describeshort with no description (empty string)', () => {
      const result = parser.parse('@describeshort');
      expect(result?.type).toBe('describeshort');
      expect(result?.args[0]).toBe('');
    });
  });

  // ─── movement ──────────────────────────────────────────────────────────────

  describe('movement commands', () => {
    const exits = { north: 'room-2', south: 'room-3', 'up the stairs': 'room-4' };

    it('parses a valid direction when it exists in exits', () => {
      const result = parser.parse('north', exits);
      expect(result).toEqual({ type: 'move', args: ['north'], timestamp: expect.any(Number) });
    });

    it('parses any direction that exists in exits', () => {
      expect(parser.parse('south', exits)?.type).toBe('move');
    });

    it('returns null for a direction not in exits', () => {
      jest.advanceTimersByTime(100);
      expect(parser.parse('east', exits)).toBeNull();
    });

    it('returns null for a direction when no exits are provided', () => {
      jest.advanceTimersByTime(100);
      expect(parser.parse('north')).toBeNull();
    });

    it('returns null for a direction when exits is empty', () => {
      jest.advanceTimersByTime(100);
      expect(parser.parse('north', {})).toBeNull();
    });

    it('matches direction case-insensitively against exits', () => {
      // command is lowercased before lookup, so NORTH -> north matches exits.north
      const result = parser.parse('NORTH', exits);
      expect(result?.type).toBe('move');
      expect(result?.args[0]).toBe('north');
    });
  });

  // ─── unknown commands ──────────────────────────────────────────────────────

  describe('unknown commands', () => {
    it('returns null for an unrecognised command with no exits', () => {
      expect(parser.parse('jump')).toBeNull();
    });

    it('returns null for an unrecognised command not matching any exit', () => {
      jest.advanceTimersByTime(100);
      expect(parser.parse('jump', { north: 'room-2' })).toBeNull();
    });
  });
});
