import { Client, Operation } from '@hiveio/dhive';
import { KeychainSDK, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
import { Location, GameMap, RoomData } from '../types/GameTypes';
import config from '../../config';
import { EventEmitter } from 'events';
import { BulkDataLoader } from './BulkDataLoader';

export class HiveClient extends EventEmitter {
  private client: Client;
  private keychain: KeychainSDK;
  private operationsStream: any = null;
  private streamReader: any = null;
  private isListening: boolean = false;
  private bulkLoader: BulkDataLoader;
  private isBulkDataLoaded: boolean = false;

  constructor() {
    super();
    this.client = new Client(config.hive.nodes);
    this.keychain = new KeychainSDK(window);
    this.bulkLoader = new BulkDataLoader(this.client, {
      maxCacheSize: 1000,
      enableCompression: true,
      loadRoomDetails: false, // Load details on-demand for memory efficiency
      memoryLimitMB: 50
    });
  }

  /**
   * Load all game data upfront for better performance
   */
  public async loadAllGameData(): Promise<GameMap> {
    if (this.isBulkDataLoaded) {
      return this.bulkLoader.getGameMap();
    }

    try {
      console.log('[HiveClient] Loading all game data upfront...');
      const gameMap = await this.bulkLoader.loadAllGameData();
      this.isBulkDataLoaded = true;
      
      // Log cache statistics
      const stats = this.bulkLoader.getCacheStats();
      console.log('[HiveClient] Bulk data load complete. Cache stats:', stats);
      
      return gameMap;
    } catch (error) {
      console.error('[HiveClient] Error loading bulk data:', error);
      throw error;
    }
  }

  /**
   * Get room data efficiently from bulk loader cache
   */
  public async getRoomData(location: Location): Promise<RoomData | null> {
    if (!this.isBulkDataLoaded) {
      console.warn('[HiveClient] Bulk data not loaded, falling back to individual room load');
      return this.loadRoomDataLegacy(location);
    }

    return this.bulkLoader.getRoomData(location);
  }

  /**
   * Legacy method for loading individual room data (fallback)
   */
  private async loadRoomDataLegacy(location: Location): Promise<RoomData | null> {
    try {
      const content = await this.database.call('get_content', [
        location.author,
        location.permlink
      ]);

      if (!content || !content.id) {
        return null;
      }

      const room: RoomData = {
        id: `${location.author}/${location.permlink}`,
        title: content.title,
        description: content.body,
        author: location.author,
        permlink: location.permlink,
        exits: {}
      };

      // Parse exits from metadata
      try {
        const metadata = JSON.parse(content.json_metadata);
        if (metadata.room) {
          room.exits = metadata.room.exits || {};
        }
      } catch (error) {
        console.error('Error parsing room metadata:', error);
      }

      return room;
    } catch (error) {
      console.error('Error loading room data:', error);
      return null;
    }
  }

  /**
   * Get room details (comments) on-demand for memory efficiency
   */
  public async getRoomDetails(author: string, permlink: string): Promise<{ [key: string]: string }> {
    try {
      const comments = await this.getComments(author, permlink);
      const authorComments = comments.filter(comment => comment.author === author);
      
      const details: { [key: string]: string } = {};
      authorComments.forEach(comment => {
        const colonIndex = comment.body.indexOf(':');
        const key = colonIndex > 0 ? comment.body.substring(0, colonIndex).trim() : comment.permlink;
        const body = colonIndex > 0 ? comment.body.substring(colonIndex + 1).trim() : comment.body;
        details[key] = body;
      });
      
      return details;
    } catch (error) {
      console.error('[HiveClient] Error loading room details:', error);
      return {};
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  public getCacheStats() {
    return this.bulkLoader.getCacheStats();
  }

  /**
   * Clear cache if memory usage is high
   */
  public clearCache(): void {
    this.bulkLoader.clearCache();
  }

  /**
   * Get the game map from bulk loader
   */
  public getGameMap(): GameMap {
    return this.bulkLoader.getGameMap();
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
      
      console.log(`[HiveClient Debug] Found ${replies?.length || 0} comments`);
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