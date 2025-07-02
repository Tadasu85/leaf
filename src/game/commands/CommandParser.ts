import { Command } from '../types/GameTypes';

// Security constants
const MAX_INPUT_LENGTH = 500;
const MAX_COMMAND_LENGTH = 100;
const MAX_ARGS_LENGTH = 400;
const ALLOWED_CHARACTERS = /^[a-zA-Z0-9\s\-_.,!?'"@#$%&*()+=<>[\]{}|\\/:;]+$/;

export class CommandParser {
  private lastCommandTime: number = 0;
  private readonly RATE_LIMIT_MS = 100; // Minimum 100ms between commands

  parse(input: string, currentRoomExits?: Record<string, string>): Command | null {
    // Input validation and sanitization
    if (!this.validateInput(input)) {
      return null;
    }

    // Rate limiting check
    if (!this.checkRateLimit()) {
      return null;
    }

    const trimmedInput = input.trim();
    if (!trimmedInput) return null;

    const parts = trimmedInput.split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Validate command length
    if (command.length > MAX_COMMAND_LENGTH) {
      return null;
    }

    // Validate args length
    const argsString = args.join(' ');
    if (argsString.length > MAX_ARGS_LENGTH) {
      return null;
    }

    switch (command) {
      case 'login':
        return this.parseLoginCommand(args);

      case 'say':
        return this.parseSayCommand(args);

      case 'emote':
        return this.parseEmoteCommand(args);

      case 'look':
        return this.parseLookCommand(args);

      case 'help':
        return {
          type: 'help',
          args: [],
          timestamp: Date.now()
        };

      case '@describe':
        return this.parseDescribeCommand(args);

      case '@describeshort':
        return this.parseDescribeShortCommand(args);

      default:
        // Check if it's a valid directional command for the current room
        if (currentRoomExits && command in currentRoomExits) {
          return {
            type: 'move',
            args: [command],
            timestamp: Date.now()
          };
        }
        return null;
    }
  }

  private validateInput(input: string): boolean {
    // Check input length
    if (!input || input.length > MAX_INPUT_LENGTH) {
      return false;
    }

    // Check for allowed characters only
    if (!ALLOWED_CHARACTERS.test(input)) {
      return false;
    }

    // Check for potential injection patterns
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /data:text\/html/i,
      /vbscript:/i,
      /expression\(/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(input)) {
        return false;
      }
    }

    return true;
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    if (now - this.lastCommandTime < this.RATE_LIMIT_MS) {
      return false;
    }
    this.lastCommandTime = now;
    return true;
  }

  private parseLoginCommand(args: string[]): Command | null {
    if (args.length === 0) {
      return null;
    }
    
    const username = args.join(' '); // Allow multi-word usernames
    // Validate username format (more permissive for multi-word)
    if (!/^[a-zA-Z0-9\s\-_]{1,50}$/.test(username)) {
      return null;
    }

    return {
      type: 'login',
      args: [username],
      timestamp: Date.now()
    };
  }

  private parseSayCommand(args: string[]): Command | null {
    const message = args.join(' ');
    // Allow empty messages for say commands
    if (message.length > MAX_ARGS_LENGTH) {
      return null;
    }

    return {
      type: 'say',
      args: [message],
      timestamp: Date.now()
    };
  }

  private parseEmoteCommand(args: string[]): Command | null {
    const emote = args.join(' ');
    // Allow empty messages for emote commands
    if (emote.length > MAX_ARGS_LENGTH) {
      return null;
    }

    return {
      type: 'emote',
      args: [emote],
      timestamp: Date.now()
    };
  }

  private parseLookCommand(args: string[]): Command | null {
    if (args.length === 0) {
      // Just "look" - look at room
      return {
        type: 'look',
        args: [],
        timestamp: Date.now()
      };
    } else {
      // "look [target]" - look at specific target
      const target = args.join(' ');
      if (target.length > MAX_ARGS_LENGTH) {
        return null;
      }
      
      return {
        type: 'lookAt',
        args: [target],
        timestamp: Date.now()
      };
    }
  }

  private parseDescribeCommand(args: string[]): Command | null {
    const description = args.join(' ');
    // Allow empty descriptions for describe commands
    if (description.length > MAX_ARGS_LENGTH) {
      return null;
    }

    return {
      type: 'describe',
      args: [description],
      timestamp: Date.now()
    };
  }

  private parseDescribeShortCommand(args: string[]): Command | null {
    const description = args.join(' ');
    // Allow empty descriptions for describe commands
    if (description.length > MAX_ARGS_LENGTH) {
      return null;
    }

    return {
      type: 'describeshort',
      args: [description],
      timestamp: Date.now()
    };
  }
} 