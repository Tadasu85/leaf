import { Client } from '@hiveio/dhive';
import { parseExitMessages } from '../rooms/exitMessages';
import { GameMap, RoomData, Location, TimeEventConfig } from '../types/GameTypes';
import { findRoom, listRooms, resolveExit } from '../rooms/mapKeys';
import config from '../../config';
import { parseRoomObjects } from '../rooms/roomObjects';
import logger from '../../utils/Logger';
import { parseRoomDetails } from '../rooms/roomFeedback';

interface CachedRoomData {
  data: RoomData;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

interface BulkLoadOptions {
  maxCacheSize?: number;
  enableCompression?: boolean;
  loadRoomDetails?: boolean;
  memoryLimitMB?: number;
}

export class BulkDataLoader {
  private client: Client;
  private roomCache: Map<string, CachedRoomData> = new Map();
  private gameMap: GameMap = {};
  private timeEventRooms: Map<string, TimeEventConfig> = new Map();
  private maxCacheSize: number;
  private enableCompression: boolean;
  private loadRoomDetails: boolean;
  private memoryLimitMB: number;
  private isInitialized: boolean = false;

  constructor(client: Client, options: BulkLoadOptions = {}) {
    this.client = client;
    this.maxCacheSize = options.maxCacheSize || 500; // Default 500 rooms for better memory management
    this.enableCompression = options.enableCompression ?? true;
    this.loadRoomDetails = options.loadRoomDetails ?? false;
    this.memoryLimitMB = options.memoryLimitMB || 100; // Default 100MB limit
  }

  /**
   * Load game map data only (not individual room content) for lazy loading
   */
  async loadAllGameData(): Promise<GameMap> {
    try {
      // Get game account's profile JSON containing the room map
      const gameAccount = await this.client.database.call('get_accounts', [[config.game.account]]);
      if (!gameAccount || !gameAccount[0]) {
        throw new Error('Failed to fetch game account data');
      }

      const parsedGameInfo = JSON.parse(gameAccount[0].posting_json_metadata);
      
      if (!parsedGameInfo.egodeathgamedata?.rooms_authors_exits) {
        throw new Error('No game map data found in profile JSON');
      }

      this.gameMap = parsedGameInfo.egodeathgamedata.rooms_authors_exits;

      // Discover time-event rooms from the game map
      this.timeEventRooms.clear();
      for (const [permlink, roomInfo] of Object.entries(this.gameMap)) {
        if (roomInfo.timeEvent) {
          this.timeEventRooms.set(permlink, {
            ...roomInfo.timeEvent,
            currentPhase: 0 // Initialised to 0; HiveClient will compute correct phase from block number
          });
        }
      }

      // Only load essential rooms (starting room and nearby) for immediate access
      await this.loadEssentialRooms();

      this.isInitialized = true;
      
      return this.gameMap;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Load starting room and its immediate exits in parallel
   */
  private async loadEssentialRooms(): Promise<void> {
    const start = findRoom(this.gameMap, config.game.startRoom.author, config.game.startRoom.permlink);
    if (!start) return;

    const toLoad: Array<[string, string, any]> = [
      [start.author, start.permlink, start.entry]
    ];

    // Add actual exit destinations, not arbitrary slice
    for (const target of Object.values(start.entry.exits || {})) {
      const room = resolveExit(this.gameMap, target);
      if (room) {
        toLoad.push([room.author, room.permlink, room.entry]);
      }
    }

    await Promise.allSettled(
      toLoad.map(([author, permlink, info]) => this.loadRoomData(author, permlink, info))
    );
  }

  /**
   * Load all rooms with memory management (kept for backward compatibility)
   */
  private async loadAllRooms(): Promise<void> {
    const roomEntries = listRooms(this.gameMap);
    const batchSize = 10; // Process in batches to avoid overwhelming the API
    
    for (let i = 0; i < roomEntries.length; i += batchSize) {
      const batch = roomEntries.slice(i, i + batchSize);
      
      // Check memory usage before processing batch
      if (this.getMemoryUsage() > this.memoryLimitMB) {
        this.clearOldestCacheEntries();
      }

      // Load batch in parallel
      const promises = batch.map((room) =>
        this.loadRoomData(room.author, room.permlink, room.entry)
      );

      await Promise.allSettled(promises);
      
      // Small delay between batches to be nice to the API
      if (i + batchSize < roomEntries.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Load individual room data with caching
   */
  private async loadRoomData(author: string, permlink: string, roomInfo: any): Promise<void> {
    const cacheKey = `${author}/${permlink}`;
    
    // Check if already cached
    if (this.roomCache.has(cacheKey)) {
      const cached = this.roomCache.get(cacheKey)!;
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      return;
    }

    try {
      const content = await this.client.database.call('get_content', [author, permlink]);
      
      if (!content || !content.author) {
        logger.warn(`[BulkDataLoader] get_content returned no usable data for ${author}/${permlink}`);
        return;
      }

      const exitMessages = parseExitMessages(content.json_metadata);
      const roomData: RoomData = {
        id: cacheKey,
        title: content.title,
        description: content.body,
        ...(exitMessages ? { exitMessages } : {}),
        author: author,
        permlink: permlink,
        exits: roomInfo.exits || {}
      };

      // Load room details (comments) if enabled
      if (this.loadRoomDetails) {
        try {
          const comments = await this.client.database.call('get_content_replies', [author, permlink]);
          roomData.details = parseRoomDetails(author, comments);
        } catch (error) {
        }
      }

      // Things the room's author made usable (ring bell, ...)
      const objects = parseRoomObjects(content.json_metadata);
      if (objects) roomData.objects = objects;

      // Compress data if enabled
      const processedData = this.enableCompression ? this.compressRoomData(roomData) : roomData;

      // Add to cache with memory management
      this.addToCache(cacheKey, processedData);
      
    } catch (error) {
      logger.error(`[BulkDataLoader] Exception loading room ${author}/${permlink}:`, error);
    }
  }

  /**
   * Get room data from cache or load if not cached
   */
  /** Title of a cached room, without loading anything. */
  getCachedTitle(author: string, permlink: string): string | undefined {
    const cached = this.roomCache.get(`${author}/${permlink}`);
    if (!cached) return undefined;
    const data = this.enableCompression ? this.decompressRoomData(cached.data) : cached.data;
    return data?.title || undefined;
  }

  async getRoomData(location: Location): Promise<RoomData | null> {
    const cacheKey = `${location.author}/${location.permlink}`;
    
    // Check cache first
    if (this.roomCache.has(cacheKey)) {
      const cached = this.roomCache.get(cacheKey)!;
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      return this.enableCompression ? this.decompressRoomData(cached.data) : cached.data;
    }

    // If not in cache, load it (this shouldn't happen if bulk load was successful)
    const mapRoom = findRoom(this.gameMap, location.author, location.permlink);
    if (mapRoom) {
      await this.loadRoomData(location.author, location.permlink, mapRoom.entry);
      const cached = this.roomCache.get(cacheKey);
      if (!cached) {
        logger.error(`[BulkDataLoader] Failed to load ${cacheKey} from blockchain`);
      }
      return cached ? (this.enableCompression ? this.decompressRoomData(cached.data) : cached.data) : null;
    }

    logger.error(`[BulkDataLoader] ${cacheKey} not in game map and not in cache`);
    return null;
  }

  /**
   * Add data to cache with memory management
   */
  private addToCache(key: string, data: RoomData): void {
    // Check if cache is full
    if (this.roomCache.size >= this.maxCacheSize) {
      this.clearOldestCacheEntries();
    }

    this.roomCache.set(key, {
      data,
      timestamp: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now()
    });
  }

  /**
   * Clear oldest cache entries based on improved LRU with memory pressure
   */
  private clearOldestCacheEntries(): void {
    const entries = Array.from(this.roomCache.entries());
    
    // Sort by priority: starting room first, then by last accessed time and access count
    entries.sort((a, b) => {
      // Starting room gets highest priority
      if (a[0].includes(config.game.startRoom.permlink)) return -1;
      if (b[0].includes(config.game.startRoom.permlink)) return 1;
      
      // Then sort by access pattern (last accessed + access count)
      const aScore = a[1].lastAccessed + (a[1].accessCount * 1000);
      const bScore = b[1].lastAccessed + (b[1].accessCount * 1000);
      return aScore - bScore;
    });

    // Remove oldest 30% of entries for more aggressive cleanup
    const toRemove = Math.ceil(entries.length * 0.3);
    for (let i = 0; i < toRemove; i++) {
      this.roomCache.delete(entries[i][0]);
    }
  }

  /**
   * Simple compression by removing whitespace and common patterns
   */
  private compressRoomData(data: RoomData): RoomData {
    return {
      ...data,
      description: data.description.replace(/\s+/g, ' ').trim(),
      title: data.title.trim()
    };
  }

  /**
   * Decompress room data (currently just returns as-is)
   */
  private decompressRoomData(data: RoomData): RoomData {
    return data;
  }

  /**
   * Get current memory usage estimate with improved accuracy
   */
  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && performance.memory) {
      return performance.memory.usedJSHeapSize / (1024 * 1024);
    }
    
    // Improved fallback estimation based on actual data size
    let totalBytes = 0;
    for (const [, cachedData] of Array.from(this.roomCache.entries())) {
      // Estimate based on actual content size
      const roomData = cachedData.data;
      totalBytes += JSON.stringify(roomData).length;
      totalBytes += 100; // Overhead for cache metadata
    }
    
    return totalBytes / (1024 * 1024);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    memoryUsageMB: number;
    hitRate: number;
  } {
    const totalAccesses = Array.from(this.roomCache.values())
      .reduce((sum, entry) => sum + entry.accessCount, 0);
    
    return {
      size: this.roomCache.size,
      maxSize: this.maxCacheSize,
      memoryUsageMB: this.getMemoryUsage(),
      hitRate: totalAccesses > 0 ? totalAccesses / (totalAccesses + this.roomCache.size) : 0
    };
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.roomCache.clear();
  }

  /** Forget one room so the next load fetches its post again (after an edit). */
  invalidateRoom(author: string, permlink: string): void {
    this.roomCache.delete(`${author}/${permlink}`);
  }

  /**
   * Check if bulk data has been loaded
   */
  isDataLoaded(): boolean {
    return this.isInitialized;
  }

  /**
   * Preload specific rooms for better performance
   */
  async preloadRooms(permlinks: string[]): Promise<void> {
    const promises = permlinks.map(target => {
      const room = resolveExit(this.gameMap, target);
      if (room) {
        return this.loadRoomData(room.author, room.permlink, room.entry);
      }
      return Promise.resolve();
    });
    
    await Promise.allSettled(promises);
  }

  /**
   * Get the game map
   */
  getGameMap(): GameMap {
    return this.gameMap;
  }

  /**
   * Get time-event rooms discovered during bulk load
   */
  getTimeEventRooms(): Map<string, TimeEventConfig> {
    return this.timeEventRooms;
  }
} 