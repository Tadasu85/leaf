import { Client } from '@hiveio/dhive';
import { GameMap, RoomData, Location } from '../types/GameTypes';
import config from '../../config';

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
  private maxCacheSize: number;
  private enableCompression: boolean;
  private loadRoomDetails: boolean;
  private memoryLimitMB: number;
  private isInitialized: boolean = false;

  constructor(client: Client, options: BulkLoadOptions = {}) {
    this.client = client;
    this.maxCacheSize = options.maxCacheSize || 1000; // Default 1000 rooms
    this.enableCompression = options.enableCompression ?? true;
    this.loadRoomDetails = options.loadRoomDetails ?? false;
    this.memoryLimitMB = options.memoryLimitMB || 50; // Default 50MB limit
  }

  /**
   * Load all game data upfront from the blockchain
   */
  async loadAllGameData(): Promise<GameMap> {
    console.log('[BulkDataLoader] Starting bulk data load...');
    
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
      console.log(`[BulkDataLoader] Found ${Object.keys(this.gameMap).length} rooms in game map`);

      // Load all room data in parallel with memory management
      await this.loadAllRooms();

      this.isInitialized = true;
      console.log('[BulkDataLoader] Bulk data load completed successfully');
      
      // Log summary of what was loaded
      const stats = this.getCacheStats();
      const totalDetails = Array.from(this.roomCache.values())
        .reduce((sum, entry) => sum + Object.keys(entry.data.details || {}).length, 0);
      
      console.log('[BulkDataLoader] 📊 Loading Summary:');
      console.log(`[BulkDataLoader]   - Total rooms loaded: ${stats.size}`);
      console.log(`[BulkDataLoader]   - Total room details: ${totalDetails}`);
      console.log(`[BulkDataLoader]   - Memory usage: ${stats.memoryUsageMB.toFixed(2)}MB`);
      console.log(`[BulkDataLoader]   - Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
      
      return this.gameMap;
    } catch (error) {
      console.error('[BulkDataLoader] Error loading game data:', error);
      throw error;
    }
  }

  /**
   * Load all rooms with memory management
   */
  private async loadAllRooms(): Promise<void> {
    const roomEntries = Object.entries(this.gameMap);
    const batchSize = 10; // Process in batches to avoid overwhelming the API
    
    console.log(`[BulkDataLoader] Loading ${roomEntries.length} rooms in batches of ${batchSize}`);

    for (let i = 0; i < roomEntries.length; i += batchSize) {
      const batch = roomEntries.slice(i, i + batchSize);
      
      // Check memory usage before processing batch
      if (this.getMemoryUsage() > this.memoryLimitMB) {
        console.warn(`[BulkDataLoader] Memory limit reached (${this.getMemoryUsage()}MB), clearing cache`);
        this.clearOldestCacheEntries();
      }

      // Load batch in parallel
      const promises = batch.map(([permlink, roomInfo]) => 
        this.loadRoomData(roomInfo.author, permlink, roomInfo)
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
      
      if (!content || !content.id) {
        console.warn(`[BulkDataLoader] Room not found: ${cacheKey}`);
        return;
      }

      const roomData: RoomData = {
        id: cacheKey,
        title: content.title,
        description: content.body,
        author: author,
        permlink: permlink,
        exits: roomInfo.exits || {}
      };

      // Log basic room data
      console.log(`[BulkDataLoader] Loading room: ${roomData.title}`);
      console.log(`[BulkDataLoader]   - Author: ${roomData.author}`);
      console.log(`[BulkDataLoader]   - Permlink: ${roomData.permlink}`);
      console.log(`[BulkDataLoader]   - Exits:`, roomData.exits);
      console.log(`[BulkDataLoader]   - Description length: ${roomData.description.length} chars`);

      // Load room details (comments) if enabled
      if (this.loadRoomDetails) {
        try {
          const comments = await this.client.database.call('get_content_replies', [author, permlink]);
          const authorComments = comments?.filter((comment: any) => comment.author === author) || [];
          
          const details: { [key: string]: string } = {};
          authorComments.forEach((comment: any) => {
            const colonIndex = comment.body.indexOf(':');
            const key = colonIndex > 0 ? comment.body.substring(0, colonIndex).trim() : comment.permlink;
            const body = colonIndex > 0 ? comment.body.substring(colonIndex + 1).trim() : comment.body;
            details[key] = body;
          });
          
          roomData.details = details;
          
          // Log room details
          if (Object.keys(details).length > 0) {
            console.log(`[BulkDataLoader]   - Details found:`, Object.keys(details));
            Object.entries(details).forEach(([key, value]) => {
              console.log(`[BulkDataLoader]     * ${key}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`);
            });
          } else {
            console.log(`[BulkDataLoader]   - No details found`);
          }
        } catch (error) {
          console.warn(`[BulkDataLoader] Failed to load details for ${cacheKey}:`, error);
        }
      } else {
        console.log(`[BulkDataLoader]   - Details loading disabled`);
      }

      // Compress data if enabled
      const processedData = this.enableCompression ? this.compressRoomData(roomData) : roomData;

      // Add to cache with memory management
      this.addToCache(cacheKey, processedData);
      
      console.log(`[BulkDataLoader] ✓ Room loaded and cached: ${roomData.title}`);

    } catch (error) {
      console.error(`[BulkDataLoader] Error loading room ${cacheKey}:`, error);
    }
  }

  /**
   * Get room data from cache or load if not cached
   */
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
    if (this.gameMap[location.permlink]) {
      await this.loadRoomData(location.author, location.permlink, this.gameMap[location.permlink]);
      const cached = this.roomCache.get(cacheKey);
      return cached ? (this.enableCompression ? this.decompressRoomData(cached.data) : cached.data) : null;
    }

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
   * Clear oldest cache entries based on LRU
   */
  private clearOldestCacheEntries(): void {
    const entries = Array.from(this.roomCache.entries());
    
    // Sort by last accessed time and access count
    entries.sort((a, b) => {
      const aScore = a[1].lastAccessed + (a[1].accessCount * 1000);
      const bScore = b[1].lastAccessed + (b[1].accessCount * 1000);
      return aScore - bScore;
    });

    // Remove oldest 20% of entries
    const toRemove = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.roomCache.delete(entries[i][0]);
    }

    console.log(`[BulkDataLoader] Cleared ${toRemove} cache entries`);
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
   * Get current memory usage estimate
   */
  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && performance.memory) {
      return performance.memory.usedJSHeapSize / (1024 * 1024);
    }
    
    // Fallback estimation based on cache size
    const estimatedBytesPerRoom = 2048; // Rough estimate
    return (this.roomCache.size * estimatedBytesPerRoom) / (1024 * 1024);
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
    console.log('[BulkDataLoader] Cache cleared');
  }

  /**
   * Check if bulk data has been loaded
   */
  isDataLoaded(): boolean {
    return this.isInitialized;
  }

  /**
   * Get the game map
   */
  getGameMap(): GameMap {
    return this.gameMap;
  }
} 