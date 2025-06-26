import { Client, Operation } from '@hiveio/dhive';
import { KeychainSDK, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
import { Location } from '../types/GameTypes';
import config from '../../config';
import { EventEmitter } from 'events';

export class HiveClient extends EventEmitter {
  private client: Client;
  private keychain: KeychainSDK;
  private operationsStream: any = null;
  private streamReader: any = null;
  private isListening: boolean = false;

  constructor() {
    super();
    this.client = new Client(config.hive.nodes);
    this.keychain = new KeychainSDK(window);
  }

  public async moveTo(username: string, location: Location): Promise<void> {
    const operation: Operation = [
      'custom_json',
      {
        required_auths: [],
        required_posting_auths: [username],
        id: config.game.idName,
        json: JSON.stringify({
          move_to: {
            Location: {
              author: location.author,
              permlink: location.permlink
            }
          }
        })
      }
    ];

    const broadcastData = {
      username,
      operations: [operation],
      method: KeychainKeyTypes.posting
    } as unknown as Broadcast;

    await this.keychain.broadcast(broadcastData);
  }

  public async setDescription(username: string, description: string): Promise<void> {
    // Get current account metadata first
    const accounts = await this.database.call('get_accounts', [[username]]);
    if (!accounts || !accounts[0]) {
      throw new Error('Failed to fetch account data');
    }

    const currentMetadata = JSON.parse(accounts[0].json_metadata || '{}');
    
    // Update the egodeathplayer section
    const updatedMetadata = {
      ...currentMetadata,
      egodeathplayer: {
        ...currentMetadata.egodeathplayer,
        Description: description
      }
    };

    const operation: Operation = [
      'account_update2',
      {
        account: username,
        json_metadata: JSON.stringify(updatedMetadata),
        posting_json_metadata: accounts[0].posting_json_metadata || ''
      }
    ];

    const broadcastData = {
      username,
      operations: [operation],
      method: KeychainKeyTypes.posting
    } as unknown as Broadcast;

    await this.keychain.broadcast(broadcastData);
  }

  public async setShortDescription(username: string, shortDescription: string): Promise<void> {
    // Get current account metadata first
    const accounts = await this.database.call('get_accounts', [[username]]);
    if (!accounts || !accounts[0]) {
      throw new Error('Failed to fetch account data');
    }

    const currentMetadata = JSON.parse(accounts[0].json_metadata || '{}');
    
    // Update the egodeathplayer section
    const updatedMetadata = {
      ...currentMetadata,
      egodeathplayer: {
        ...currentMetadata.egodeathplayer,
        ShortDesc: shortDescription
      }
    };

    const operation: Operation = [
      'account_update2',
      {
        account: username,
        json_metadata: JSON.stringify(updatedMetadata),
        posting_json_metadata: accounts[0].posting_json_metadata || ''
      }
    ];

    const broadcastData = {
      username,
      operations: [operation],
      method: KeychainKeyTypes.posting
    } as unknown as Broadcast;

    await this.keychain.broadcast(broadcastData);
  }

  public async startMoveListener(username: string, startFromBlock?: number): Promise<void> {
    if (this.isListening) {
      this.stopMoveListener();
    }

    this.isListening = true;

    try {
      const currentBlock = startFromBlock || await this.client.blockchain.getCurrentBlockNum();
      // getOperations returns an async iterator
      const operations = this.client.blockchain.getOperations(currentBlock);
      this.processOperationsAsyncIterator(username, operations);
    } catch (error) {
      console.error('[HiveClient Debug] Error starting operations stream:', error);
      this.isListening = false;
    }
  }

  private async processOperationsAsyncIterator(username: string, operations: AsyncGenerator<any, void, unknown>): Promise<void> {
    try {
      for await (const operation of operations) {
        if (!this.isListening) break;
        // Check if this is a custom_json operation for our game
        if (operation.op[0] === 'custom_json' && operation.op[1].id === config.game.idName) {
          try {
            const jsonData = JSON.parse(operation.op[1].json);
            if (jsonData.move_to?.Location) {
              console.log('[HiveClient Debug] New move_to operation detected:', jsonData.move_to.Location, 'operation ID:', operation.trx_id);
              // Emit event for the new move operation
              this.emit('moveDetected', {
                username,
                location: jsonData.move_to.Location,
                transactionId: operation.trx_id,
                timestamp: operation.timestamp
              });
            }
          } catch (error) {
            console.error('[HiveClient Debug] Error parsing move operation:', error);
          }
        }
      }
    } catch (error) {
      console.error('[HiveClient Debug] Error in operations async iterator:', error);
      // Restart the stream after a delay
      setTimeout(() => {
        if (this.isListening) {
          console.log('[HiveClient Debug] Restarting operations async iterator after error');
          this.startMoveListener(username);
        }
      }, 5000);
    }
  }

  public stopMoveListener(): void {
    this.isListening = false;
  }

  public getClient(): Client {
    return this.client;
  }

  public get database() {
    return this.client.database;
  }

  public async getComments(author: string, permlink: string): Promise<any[]> {
    try {
      console.log(`[HiveClient Debug] Fetching comments for ${author}/${permlink}`);
      const replies = await this.client.database.call('get_content_replies', [
        author,
        permlink
      ]);
      
      console.log(`[HiveClient Debug] Found ${replies.length} comments`);
      return replies || [];
    } catch (error) {
      console.error('[HiveClient Debug] Error fetching comments:', error);
      return [];
    }
  }

  public async getProfileImage(username: string): Promise<string | null> {
    try {
      const accounts = await this.client.database.call('get_accounts', [[username]]);
      if (accounts && accounts[0] && accounts[0].json_metadata) {
        const metadata = JSON.parse(accounts[0].json_metadata);
        return metadata.profile?.profile_image || null;
      }
    } catch (error) {
      console.error('[HiveClient Debug] Error fetching profile image:', error);
    }
    return null;
  }
} 