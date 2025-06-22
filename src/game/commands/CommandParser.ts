import { Command } from '../types/GameTypes';

export class CommandParser {
  parse(input: string, currentRoomExits?: Record<string, string>): Command | null {
    const trimmedInput = input.trim();
    if (!trimmedInput) return null;

    const parts = trimmedInput.split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'login':
        return {
          type: 'login',
          args,
          timestamp: Date.now()
        };

      case 'say':
        return {
          type: 'say',
          args: [parts.slice(1).join(' ')],
          timestamp: Date.now()
        };

      case 'emote':
        return {
          type: 'emote',
          args: [parts.slice(1).join(' ')],
          timestamp: Date.now()
        };

      case 'look':
        return {
          type: 'look',
          args: [],
          timestamp: Date.now()
        };

      case 'help':
        return {
          type: 'help',
          args: [],
          timestamp: Date.now()
        };

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
} 