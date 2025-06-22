import { Command, CommandType } from '../types/GameTypes';
import { GameState } from '../state/GameState';
import { KeychainSDK, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
import config from '../../config';

export class CommandHandler {
  private keychain: KeychainSDK;

  constructor(
    private gameState: GameState
  ) {
    this.keychain = new KeychainSDK(window);
  }

  public async handleCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.trim().split(' ');
    const player = this.gameState.getPlayer();

    switch (cmd.toLowerCase()) {
      case 'move':
        if (!player) {
          this.gameState.addOutput({ output: 'Please login first', bold: true });
          return;
        }
        if (player.isAdmin) {
          this.gameState.addOutput({ 
            output: 'Admin users cannot use game commands. Use the Queue button to manage build requests.', 
            bold: true 
          });
          return;
        }
        await this.handleMove(args[0]);
        break;

      case 'say':
        if (!player) {
          this.gameState.addOutput({ output: 'Please login first', bold: true });
          return;
        }
        if (player.isAdmin) {
          this.gameState.addOutput({ 
            output: 'Admin users cannot use game commands. Use the Queue button to manage build requests.', 
            bold: true 
          });
          return;
        }
        await this.handleSay(args.join(' '));
        break;

      case 'emote':
        if (!player) {
          this.gameState.addOutput({ output: 'Please login first', bold: true });
          return;
        }
        if (player.isAdmin) {
          this.gameState.addOutput({ 
            output: 'Admin users cannot use game commands. Use the Queue button to manage build requests.', 
            bold: true 
          });
          return;
        }
        await this.handleEmote(args.join(' '));
        break;

      case 'look':
        if (!player) {
          this.gameState.addOutput({ output: 'Please login first', bold: true });
          return;
        }
        if (player.isAdmin) {
          this.gameState.addOutput({ 
            output: 'Admin users cannot use game commands. Use the Queue button to manage build requests.', 
            bold: true 
          });
          return;
        }
        await this.handleLook();
        break;

      case 'login':
        await this.handleLogin(args[0]);
        break;

      case 'help':
        this.handleHelp(player?.isAdmin || false);
        break;

      default:
        this.gameState.addOutput({ output: 'Unknown command. Type "help" for available commands.', bold: true });
    }
  }

  private async handleLogin(username: string): Promise<void> {
    if (!username) {
      this.gameState.addOutput({ output: 'Please provide a username: login <username>', bold: true });
      return;
    }
    await this.gameState.login(username);
  }

  private async handleMove(direction: string): Promise<void> {
    if (!direction) {
      this.gameState.addOutput({ output: 'Please specify a direction', bold: true });
      return;
    }

    const currentRoom = this.gameState.getCurrentRoom();
    if (!currentRoom) {
      this.gameState.addOutput({ output: 'No current room found', bold: true });
      return;
    }

    const destination = currentRoom.exits[direction];
    if (!destination) {
      this.gameState.addOutput({ output: `You cannot go ${direction}.`, bold: true });
      return;
    }

    const player = this.gameState.getPlayer();
    if (!player) {
      this.gameState.addOutput({ output: 'Player not found', bold: true });
      return;
    }

    this.gameState.addOutput({ output: `Moving ${direction}...`, bold: true });

    try {
      // Use GameState's move method which handles both blockchain operation and local state updates
      await this.gameState.move(direction);
      this.gameState.addOutput({ output: `Moved ${direction}.`, bold: true });
    } catch (error) {
      console.error('Error in move:', error);
      this.gameState.addOutput({ 
        output: 'Move failed. Please check your Keychain and try again.', 
        bold: true 
      });
    }
  }

  private async handleSay(message: string): Promise<void> {
    if (!message) {
      this.gameState.addOutput({ output: 'Please provide a message: say <message>', bold: true });
      return;
    }

    const roomId = this.gameState.getCurrentRoomIdentifier();
    if (!roomId) {
      this.gameState.addOutput({ output: 'Not in a room', bold: true });
      return;
    }

    const player = this.gameState.getPlayer();
    if (!player) {
      this.gameState.addOutput({ output: 'Player not found', bold: true });
      return;
    }

    // Call GameState's say method which handles both local display and network communication
    this.gameState.say(message);
  }

  private async handleEmote(emote: string): Promise<void> {
    if (!emote) {
      this.gameState.addOutput({ output: 'Please provide an emote: emote <emote>', bold: true });
      return;
    }

    const roomId = this.gameState.getCurrentRoomIdentifier();
    if (!roomId) {
      this.gameState.addOutput({ output: 'Not in a room', bold: true });
      return;
    }

    const player = this.gameState.getPlayer();
    if (!player) {
      this.gameState.addOutput({ output: 'Player not found', bold: true });
      return;
    }

    // Call GameState's emote method which handles both local display and network communication
    this.gameState.emote(emote);
  }

  private async handleLook(): Promise<void> {
    const currentRoom = this.gameState.getCurrentRoom();
    if (!currentRoom) {
      this.gameState.addOutput({ output: 'No current room found', bold: true });
      return;
    }

    this.gameState.addOutput({ output: currentRoom.title, bold: true });
    this.gameState.addOutput({ output: currentRoom.description, bold: false });
  }

  private handleHelp(isAdmin: boolean): void {
    if (isAdmin) {
      this.gameState.addOutput({ output: 'Admin commands:', bold: true });
      this.gameState.addOutput({ output: 'login <username> - Login to the admin panel', bold: true });
      this.gameState.addOutput({ output: 'help - Show this help message', bold: true });
      this.gameState.addOutput({ output: 'Use the Queue button to manage build requests.', bold: true });
    } else {
      this.gameState.addOutput({ output: 'Available commands:', bold: true });
      this.gameState.addOutput({ output: 'login <username> - Login to the game', bold: true });
      this.gameState.addOutput({ output: 'say <message> - Send a chat message', bold: true });
      this.gameState.addOutput({ output: 'emote <emote> - Perform an emote', bold: true });
      this.gameState.addOutput({ output: 'look - Look around the current room', bold: true });
      this.gameState.addOutput({ output: 'help - Show this help message', bold: true });
      this.gameState.addOutput({ 
        output: 'Movement: Use directional commands like north, south, east, west, up, down, etc.', 
        bold: true 
      });
    }
  }
} 