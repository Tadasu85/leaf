import { Client, Operation } from '@hiveio/dhive';
import { KeychainSDK, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
import { Location, GameMap, RoomData, BlockchainTimeEvent, TimeEventConfig } from '../types/GameTypes';
import config from '../../config';
import { EventEmitter } from 'events';
import { BulkDataLoader } from './BulkDataLoader';
import logger from '../../utils/Logger';

export class HiveClient extends EventEmitter {
  private client: Client;
  private keychain: KeychainSDK;
  private operationsStream: any = null;
  private streamReader: any = null;
  private isListening: boolean = false;
  private bulkLoader: BulkDataLoader;
  private isBulkDataLoaded: boolean = false;
  private timeEventRooms: Map<string, TimeEventConfig> = new Map();
  private lastProcessedBlock: number = 0;

  constructor() {
    super();
    this.client = new Client(config.hive.nodes);
    this.keychain = new KeychainSDK(window);
    this.bulkLoader = new BulkDataLoader(this.client, {
      maxCacheSize: 500, // Reduced from 1000 to 500 for better memory management
      enableCompression: true,
      loadRoomDetails: false, // Disabled to reduce memory usage - load on demand instead
      memoryLimitMB: 100 // Set to 100MB as requested
    });
  }

  /**
   * Register a room for time-based events
   */
  public registerTimeEventRoom(roomPermlink: string, config: TimeEventConfig): void {
    this.timeEventRooms.set(roomPermlink, config);
    logger.debug(`Registered time event room: ${roomPermlink}`, config);
  }

  /**
   * Unregister a room from time-based events
   */
  public unregisterTimeEventRoom(roomPermlink: string): void {
    this.timeEventRooms.delete(roomPermlink);
    logger.debug(`Unregistered time event room: ${roomPermlink}`);
  }

  /**
   * Get time event config for a room
   */
  public getTimeEventConfig(roomPermlink: string): TimeEventConfig | undefined {
    return this.timeEventRooms.get(roomPermlink);
  }

  /**
   * Check if a room has time-based events
   */
  public isTimeEventRoom(roomPermlink: string): boolean {
    return this.timeEventRooms.has(roomPermlink);
  }

  /**
   * Process time-based events for a specific block
   */
  private async processTimeEvents(blockNumber: number): Promise<void> {
    for (const [roomPermlink, config] of this.timeEventRooms.entries()) {
      // Initialize lastChangeBlock if it's 0 (first time)
      if (config.lastChangeBlock === 0) {
        const newConfig: TimeEventConfig = {
          ...config,
          lastChangeBlock: blockNumber
        };
        this.timeEventRooms.set(roomPermlink, newConfig);
        logger.debug(`Initialized time event for room ${roomPermlink} at block ${blockNumber}`);
        continue;
      }
      
      const blocksSinceLastChange = blockNumber - config.lastChangeBlock;
      
      if (blocksSinceLastChange >= config.intervalBlocks) {
        // Time to change the event
        const nextPhase = (config.currentPhase + 1) % config.phases.length;
        const newConfig: TimeEventConfig = {
          ...config,
          lastChangeBlock: blockNumber,
          currentPhase: nextPhase
        };
        
        this.timeEventRooms.set(roomPermlink, newConfig);
        
        // Emit time event
        const timeEvent: BlockchainTimeEvent = {
          type: 'timeEvent',
          roomPermlink,
          author: config.phases[nextPhase]?.name || 'Unknown',
          currentBlock: blockNumber,
          eventType: config.type,
          phase: nextPhase,
          timestamp: new Date().toISOString()
        };
        
        this.emit('timeEventDetected', timeEvent);
        logger.debug(`Time event triggered for room ${roomPermlink}: phase ${nextPhase}`);
      }
    }
  }

  /**
   * Load all game data upfront for better performance
   */
  public async loadAllGameData(): Promise<GameMap> {
    if (this.isBulkDataLoaded) {
      return this.bulkLoader.getGameMap();
    }

    try {
      await this.bulkLoader.loadAllGameData();
      this.isBulkDataLoaded = true;
      return this.bulkLoader.getGameMap();
    } catch (error) {
      logger.error('Error loading game data:', error);
      throw error;
    }
  }

  /**
   * Get room data efficiently from bulk loader cache
   */
  public async getRoomData(location: Location): Promise<RoomData | null> {
    if (!this.isBulkDataLoaded) {
      logger.warn('Bulk data not loaded, falling back to individual room load');
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
        logger.error('Error parsing room metadata:', error);
      }

      return room;
    } catch (error) {
      logger.error('Error loading room data:', error);
      return null;
    }
  }

  /**
   * Get room details (comments) on-demand for memory efficiency
   */
  public async getRoomDetails(author: string, permlink: string): Promise<{ [key: string]: string }> {
    try {
      const comments = await this.database.call('get_content_replies', [author, permlink]);
      const authorComments = comments?.filter((comment: any) => comment.author === author) || [];
      
      const details: { [key: string]: string } = {};
      authorComments.forEach((comment: any) => {
        const colonIndex = comment.body.indexOf(':');
        const key = colonIndex > 0 ? comment.body.substring(0, colonIndex).trim() : comment.permlink;
        const body = colonIndex > 0 ? comment.body.substring(colonIndex + 1).trim() : comment.body;
        details[key] = body;
      });
      
      return details;
    } catch (error) {
      logger.error('Error loading room details:', error);
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
        
        // Process time events for each new block
        if (operation.block_num && operation.block_num > this.lastProcessedBlock) {
          this.lastProcessedBlock = operation.block_num;
          await this.processTimeEvents(operation.block_num);
        }
        
        // Check if this is a custom_json operation for our game
        if (operation.op[0] === 'custom_json' && operation.op[1].id === config.game.idName) {
          try {
            const jsonData = JSON.parse(operation.op[1].json);
            if (jsonData.move_to?.Location) {
              // CRITICAL FIX: Only process operations for the specific user
              // Check if the operation's required_posting_auths contains our username
              const requiredPostingAuths = operation.op[1].required_posting_auths || [];
              if (requiredPostingAuths.includes(username)) {
                // Emit event for the new move operation
                this.emit('moveDetected', {
                  username,
                  location: jsonData.move_to.Location,
                  transactionId: operation.trx_id,
                  timestamp: operation.timestamp
                });
              }
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