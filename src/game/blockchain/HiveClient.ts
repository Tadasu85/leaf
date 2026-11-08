import { Client, Operation } from '@hiveio/dhive';
import { KeychainSDK, KeychainKeyTypes, Broadcast } from 'keychain-sdk';
import { Location, GameMap, RoomData, BlockchainTimeEvent, TimeEventConfig } from '../types/GameTypes';
import config from '../../config';
import { EventEmitter } from 'events';
import { BulkDataLoader } from './BulkDataLoader';
import logger from '../../utils/Logger';

export class HiveClient extends EventEmitter {
  private client: Client;
  private keychain: any; // Changed to any to support both KeychainSDK and mobile interface
  private operationsStream: any = null;
  private streamReader: any = null;
  private isListening: boolean = false;
  private bulkLoader: BulkDataLoader;
  private isBulkDataLoaded: boolean = false;
  private timeEventRooms: Map<string, TimeEventConfig> = new Map();
  private lastProcessedBlock: number = 0;
  private timeEventTimer: ReturnType<typeof setInterval> | null = null;

  constructor(keychain?: any) {
    super();
    this.client = new Client(config.hive.nodes);
    this.keychain = keychain || new KeychainSDK(window);
    this.bulkLoader = new BulkDataLoader(this.client, {
      maxCacheSize: 500, // Reduced from 1000 to 500 for better memory management
      enableCompression: false, // Disabled to preserve room description formatting
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
   * Compute the current phase for a time-event room deterministically from block number.
   * Every client at the same block number will compute the same phase.
   */
  private computePhase(config: TimeEventConfig, blockNumber: number): number {
    const phaseCount = Array.isArray(config.phases) ? config.phases.length : 0;
    if (phaseCount === 0 || !(config.intervalBlocks > 0)) return 0;
    const offset = Number.isInteger(config.startPhase) ? ((config.startPhase! % phaseCount) + phaseCount) % phaseCount : 0;
    if (!config.startBlock || blockNumber < config.startBlock) return offset;
    return (Math.floor((blockNumber - config.startBlock) / config.intervalBlocks) + offset) % phaseCount;
  }

  /**
   * Process time-based events for a specific block.
   * Phase is derived purely from block number — no mutable state needed.
   */
  private processTimeEvents(blockNumber: number): void {
    for (const [roomPermlink, timeConfig] of this.timeEventRooms.entries()) {
      const newPhase = this.computePhase(timeConfig, blockNumber);

      if (newPhase !== timeConfig.currentPhase) {
        const updatedConfig: TimeEventConfig = { ...timeConfig, currentPhase: newPhase };
        this.timeEventRooms.set(roomPermlink, updatedConfig);

        const timeEvent: BlockchainTimeEvent = {
          type: 'timeEvent',
          roomPermlink,
          currentBlock: blockNumber,
          eventType: updatedConfig.type,
          phase: newPhase,
          timestamp: new Date().toISOString()
        };

        this.emit('timeEventDetected', timeEvent);
        logger.debug(`Time event phase change for room ${roomPermlink}: ${timeConfig.currentPhase} → ${newPhase}`);
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

      // Auto-register time-event rooms discovered during bulk load
      const discovered = this.bulkLoader.getTimeEventRooms();
      if (discovered.size > 0) {
        try {
          const currentBlock = await this.client.blockchain.getCurrentBlockNum();
          this.lastProcessedBlock = currentBlock;

          for (const [permlink, timeConfig] of discovered.entries()) {
            const initialPhase = this.computePhase(timeConfig, currentBlock);
            this.timeEventRooms.set(permlink, { ...timeConfig, currentPhase: initialPhase });
            logger.debug(`Registered time-event room ${permlink}, initial phase ${initialPhase} at block ${currentBlock}`);
          }
        } catch (error) {
          // Non-fatal — phases will be corrected once block streaming begins
          logger.warn('[HiveClient] Could not fetch current block for time-event initialisation:', error);
          for (const [permlink, timeConfig] of discovered.entries()) {
            this.timeEventRooms.set(permlink, timeConfig);
          }
        }
      }

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

    const result = await this.bulkLoader.getRoomData(location);
    if (!result) {
      // Room not in game map (e.g. starting room not registered, or stale move_to location)
      // Fall back to direct blockchain fetch
      return this.loadRoomDataLegacy(location);
    }
    return result;
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

      if (!content || !content.author) {
        logger.warn(`[HiveClient] loadRoomDataLegacy: get_content returned no usable data for ${location.author}/${location.permlink}`);
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

    const currentMetadata = JSON.parse(accounts[0].posting_json_metadata || '{}');

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
        json_metadata: accounts[0].json_metadata || '',
        posting_json_metadata: JSON.stringify(updatedMetadata)
      }
    ];

    const broadcastData = {
      username,
      operations: [operation],
      method: KeychainKeyTypes.posting
    } as unknown as Broadcast;

    await this.keychain.broadcast(broadcastData);
  }

  /**
   * Save the player's home room in their own posting_json_metadata
   * (egodeathplayer.home), keeping everything else in it.
   */
  public async setPlayerHome(username: string, home: { author: string; permlink: string }): Promise<void> {
    const accounts = await this.database.call('get_accounts', [[username]]);
    if (!accounts || !accounts[0]) {
      throw new Error('Failed to fetch account data');
    }
    const currentMetadata = JSON.parse(accounts[0].posting_json_metadata || '{}');
    const updatedMetadata = {
      ...currentMetadata,
      egodeathplayer: {
        ...currentMetadata.egodeathplayer,
        home: { author: home.author, permlink: home.permlink }
      }
    };
    const operation: Operation = [
      'account_update2',
      {
        account: username,
        json_metadata: accounts[0].json_metadata || '',
        posting_json_metadata: JSON.stringify(updatedMetadata)
      }
    ];
    const result = await this.keychain.broadcast({
      username,
      operations: [operation],
      method: KeychainKeyTypes.posting
    } as unknown as Broadcast) as { success?: boolean; message?: string } | undefined;
    if (result && result.success === false) {
      throw new Error(result.message || 'Keychain did not save your home');
    }
  }

  public async setShortDescription(username: string, shortDescription: string): Promise<void> {
    // Get current account metadata first
    const accounts = await this.database.call('get_accounts', [[username]]);
    if (!accounts || !accounts[0]) {
      throw new Error('Failed to fetch account data');
    }

    const currentMetadata = JSON.parse(accounts[0].posting_json_metadata || '{}');

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
        json_metadata: accounts[0].json_metadata || '',
        posting_json_metadata: JSON.stringify(updatedMetadata)
      }
    ];

    const broadcastData = {
      username,
      operations: [operation],
      method: KeychainKeyTypes.posting
    } as unknown as Broadcast;

    await this.keychain.broadcast(broadcastData);
  }

  public async updatePost(username: string, permlink: string, title: string, body: string, jsonMetadata: any): Promise<void> {
    // First, get the original post to get its parent information
    const originalPost = await this.database.call('get_content', [username, permlink]);
    if (!originalPost) {
      throw new Error('Original post not found');
    }

    // Merge the new metadata over the post's existing metadata so fields the
    // caller doesn't send (connection, timeEvent, ...) are preserved.
    let existingMetadata: Record<string, any> = {};
    try {
      const parsed = originalPost.json_metadata ? JSON.parse(originalPost.json_metadata) : {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) existingMetadata = parsed;
    } catch {
      logger.warn(`[HiveClient] updatePost: existing json_metadata for ${username}/${permlink} is not valid JSON; replacing it`);
    }
    const mergedMetadata = { ...existingMetadata, ...jsonMetadata };

    // Use comment operation to update the post (works even after payout)
    // Use the same parent author and permlink as the original post
    const operation: Operation = [
      'comment',
      {
        parent_author: originalPost.parent_author,
        parent_permlink: originalPost.parent_permlink,
        author: username,
        permlink: permlink,
        title: title,
        body: body,
        json_metadata: JSON.stringify(mergedMetadata)
      }
    ];

    const broadcastData = {
      username,
      operations: [operation],
      method: KeychainKeyTypes.posting
    } as unknown as Broadcast;

    const result = await this.keychain.broadcast(broadcastData) as { success?: boolean; message?: string } | undefined;
    if (result && result.success === false) {
      throw new Error(result.message || 'Failed to update the room');
    }
  }

  /**
   * Ask Keychain to sign a message with the account's posting key (used for
   * the chat login). Returns the hex signature, or null if the user cancels
   * or the Keychain in use can't sign messages.
   */
  public async signMessage(username: string, message: string): Promise<string | null> {
    if (!this.keychain || typeof this.keychain.signBuffer !== 'function') {
      logger.warn('[HiveClient] Keychain cannot sign messages here; chat login unavailable');
      return null;
    }
    try {
      const result = await this.keychain.signBuffer({
        username,
        message,
        method: KeychainKeyTypes.posting
      }) as { success?: boolean; result?: unknown; message?: string } | undefined;
      if (!result || result.success === false || typeof result.result !== 'string') {
        logger.warn('[HiveClient] Keychain did not sign the chat login:', result?.message);
        return null;
      }
      return result.result;
    } catch (error) {
      logger.warn('[HiveClient] Keychain signing failed or was cancelled:', error);
      return null;
    }
  }

  public async startBlockStream(startFromBlock?: number): Promise<void> {
    if (this.isListening) {
      this.stopMoveListener();
    }

    this.isListening = true;

    try {
      const currentBlock = startFromBlock || await this.client.blockchain.getCurrentBlockNum();
      const operations = this.client.blockchain.getOperations(currentBlock);
      this.processOperationsAsyncIterator(operations);
    } catch (error) {
      logger.error('[HiveClient Debug] Error starting block stream:', error);
      this.isListening = false;
    }

    this.startTimeEventPoller();
  }

  private startTimeEventPoller(): void {
    if (this.timeEventTimer) clearInterval(this.timeEventTimer);
    this.timeEventTimer = setInterval(async () => {
      if (!this.isListening || this.timeEventRooms.size === 0) return;
      try {
        const blockNum = await this.client.blockchain.getCurrentBlockNum();
        if (blockNum > this.lastProcessedBlock) {
          this.lastProcessedBlock = blockNum;
          this.processTimeEvents(blockNum);
        }
      } catch (e) {
        logger.warn('[HiveClient] Time event poller failed to fetch block number', e);
      }
    }, 10000); // poll every 10 seconds — fine-grained enough given intervalBlocks * 3s
  }

  private async processOperationsAsyncIterator(operations: AsyncGenerator<any, void, unknown>): Promise<void> {
    try {
      for await (const operation of operations) {
        if (!this.isListening) break;

        // Process time events for each new block
        if (operation.block_num && operation.block_num > this.lastProcessedBlock) {
          this.lastProcessedBlock = operation.block_num;
          this.processTimeEvents(operation.block_num);
        }
      }
    } catch (error) {
      logger.error('[HiveClient Debug] Error in operations async iterator:', error);
      // Restart the stream after a delay
      setTimeout(() => {
        if (this.isListening) {
          this.startBlockStream();
        }
      }, 5000);
    }
  }

  public stopMoveListener(): void {
    this.isListening = false;
    if (this.timeEventTimer) {
      clearInterval(this.timeEventTimer);
      this.timeEventTimer = null;
    }
  }

  public getClient(): Client {
    return this.client;
  }

  public get database() {
    return this.client.database;
  }



  public async getBuilderProgress(username: string): Promise<{
    uniqueRooms: number;
    totalSeconds: number;
    explorerMet: boolean;
    chroniclerMet: boolean;
  }> {
    const EXPLORER_THRESHOLD = 25;
    const CHRONICLER_THRESHOLD = 5 * 3600;
    const MAX_DWELL = 3600;

    const moves: { timestamp: string; author: string; permlink: string }[] = [];
    let from = -1;
    const limit = 1000;

    for (let page = 0; page < 5; page++) {
      const history = (await this.database.getAccountHistory(username, from, limit)) as [number, any][];
      if (!history || !history.length) break;

      for (const [, op] of history) {
        if (op.op[0] === 'custom_json' && op.op[1]['id'] === config.game.idName) {
          try {
            const json = JSON.parse(op.op[1]['json']);
            if (json.move_to?.Location) {
              moves.push({ timestamp: op.timestamp, ...json.move_to.Location });
            }
          } catch { /* malformed op */ }
        }
      }

      if (history.length < limit) break;
      const earliest = history[0];
      if (!earliest || earliest[0] === 0) break;
      from = earliest[0] - 1;
    }

    moves.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const uniqueRooms = new Set(moves.map(m => `${m.author}/${m.permlink}`)).size;

    let totalSeconds = 0;
    for (let i = 0; i < moves.length - 1; i++) {
      const dwell = (Date.parse(moves[i + 1].timestamp) - Date.parse(moves[i].timestamp)) / 1000;
      totalSeconds += Math.min(dwell, MAX_DWELL);
    }

    return {
      uniqueRooms,
      totalSeconds,
      explorerMet: uniqueRooms >= EXPLORER_THRESHOLD,
      chroniclerMet: totalSeconds >= CHRONICLER_THRESHOLD
    };
  }

  public async getProfileImage(username: string): Promise<string | null> {
    try {
      const accounts = await this.client.database.call('get_accounts', [[username]]);
      if (accounts && accounts[0]) {
        const account = accounts[0];
        const sources = [account.posting_json_metadata, account.json_metadata];
        for (const raw of sources) {
          if (!raw) continue;
          try {
            const image = JSON.parse(raw).profile?.profile_image;
            if (image) return image;
          } catch {}
        }
      }
    } catch (error) {
      logger.error('[HiveClient Debug] Error fetching profile image:', error);
    }
    return null;
  }
} 