import { CommandParser } from './CommandParser';

describe('CommandParser', () => {
  let parser: CommandParser;

  beforeEach(() => {
    parser = new CommandParser();
  });

  describe('login command', () => {
    it('should parse login command with username', () => {
      const result = parser.parse('login testuser');
      
      expect(result).toEqual({
        type: 'login',
        args: ['testuser'],
        timestamp: expect.any(Number)
      });
    });

    it('should parse login command with multiple word username', () => {
      const result = parser.parse('login test user name');
      
      expect(result).toEqual({
        type: 'login',
        args: ['test', 'user', 'name'],
        timestamp: expect.any(Number)
      });
    });
  });

  describe('say command', () => {
    it('should parse say command with message', () => {
      const result = parser.parse('say Hello, world!');
      
      expect(result).toEqual({
        type: 'say',
        args: ['Hello, world!'],
        timestamp: expect.any(Number)
      });
    });

    it('should parse say command with empty message', () => {
      const result = parser.parse('say');
      
      expect(result).toEqual({
        type: 'say',
        args: [''],
        timestamp: expect.any(Number)
      });
    });
  });

  describe('emote command', () => {
    it('should parse emote command with emote', () => {
      const result = parser.parse('emote waves hello');
      
      expect(result).toEqual({
        type: 'emote',
        args: ['waves hello'],
        timestamp: expect.any(Number)
      });
    });
  });

  describe('look command', () => {
    it('should parse look command without args as look', () => {
      const result = parser.parse('look');
      
      expect(result).toEqual({
        type: 'look',
        args: [],
        timestamp: expect.any(Number)
      });
    });

    it('should parse look command with target as lookAt', () => {
      const result = parser.parse('look flock of gulls');
      
      expect(result).toEqual({
        type: 'lookAt',
        args: ['flock of gulls'],
        timestamp: expect.any(Number)
      });
    });

    it('should parse look command with single word target', () => {
      const result = parser.parse('look gulls');
      
      expect(result).toEqual({
        type: 'lookAt',
        args: ['gulls'],
        timestamp: expect.any(Number)
      });
    });

    it('should parse look command with complex target', () => {
      const result = parser.parse('look herd animals in the distance');
      
      expect(result).toEqual({
        type: 'lookAt',
        args: ['herd animals in the distance'],
        timestamp: expect.any(Number)
      });
    });
  });

  describe('help command', () => {
    it('should parse help command', () => {
      const result = parser.parse('help');
      
      expect(result).toEqual({
        type: 'help',
        args: [],
        timestamp: expect.any(Number)
      });
    });
  });

  describe('movement commands', () => {
    it('should parse directional commands when exits are available', () => {
      const exits = { north: 'northroom', south: 'southroom' };
      const result = parser.parse('north', exits);
      
      expect(result).toEqual({
        type: 'move',
        args: ['north'],
        timestamp: expect.any(Number)
      });
    });

    it('should not parse directional commands when exits are not available', () => {
      const exits = { north: 'northroom' };
      const result = parser.parse('south', exits);
      
      expect(result).toBeNull();
    });

    it('should not parse directional commands when no exits are provided', () => {
      const result = parser.parse('north');
      
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      const result = parser.parse('');
      expect(result).toBeNull();
    });

    it('should handle whitespace-only input', () => {
      const result = parser.parse('   ');
      expect(result).toBeNull();
    });

    it('should handle case insensitive commands', () => {
      const result = parser.parse('LOOK flock of gulls');
      
      expect(result).toEqual({
        type: 'lookAt',
        args: ['flock of gulls'],
        timestamp: expect.any(Number)
      });
    });

    it('should handle unknown commands', () => {
      const result = parser.parse('unknowncommand');
      expect(result).toBeNull();
    });

    it('should handle commands with extra whitespace', () => {
      const result = parser.parse('  look   flock of gulls  ');
      
      expect(result).toEqual({
        type: 'lookAt',
        args: ['  flock of gulls'],
        timestamp: expect.any(Number)
      });
    });
  });
}); 