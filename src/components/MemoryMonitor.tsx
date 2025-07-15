import React, { useState, useEffect } from 'react';
import { HiveClient } from '../game/blockchain/HiveClient';
import logger from '../utils/Logger';

interface MemoryMonitorProps {
  hiveClient: HiveClient | null;
  isVisible?: boolean;
}

interface CacheStats {
  size: number;
  maxSize: number;
  memoryUsageMB: number;
  hitRate: number;
}

export const MemoryMonitor: React.FC<MemoryMonitorProps> = ({ 
  hiveClient, 
  isVisible = false 
}) => {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [memoryUsage, setMemoryUsage] = useState<number>(0);

  useEffect(() => {
    if (!hiveClient || !isVisible) return;

    const updateStats = () => {
      try {
        const stats = hiveClient.getCacheStats();
        setCacheStats(stats);
        
        // Get browser memory usage if available
        if (typeof performance !== 'undefined' && performance.memory) {
          setMemoryUsage(performance.memory.usedJSHeapSize / (1024 * 1024));
        }
      } catch (error) {
        logger.error('[MemoryMonitor] Error getting cache stats:', error);
      }
    };

    // Update immediately
    updateStats();

    // Update every 5 seconds
    const interval = setInterval(updateStats, 5000);

    return () => clearInterval(interval);
  }, [hiveClient, isVisible]);

  if (!isVisible || !cacheStats) {
    return null;
  }

  const getMemoryColor = (usage: number) => {
    if (usage > 40) return 'text-red-500';
    if (usage > 25) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getHitRateColor = (rate: number) => {
    if (rate > 0.8) return 'text-green-500';
    if (rate > 0.6) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 text-white p-4 rounded-lg shadow-lg text-sm z-50">
      <h3 className="font-bold mb-2">Memory Monitor</h3>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Cache Size:</span>
          <span>{cacheStats.size} / {cacheStats.maxSize}</span>
        </div>
        
        <div className="flex justify-between">
          <span>Cache Memory:</span>
          <span className={getMemoryColor(cacheStats.memoryUsageMB)}>
            {cacheStats.memoryUsageMB.toFixed(1)}MB
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Browser Memory:</span>
          <span className={getMemoryColor(memoryUsage)}>
            {memoryUsage.toFixed(1)}MB
          </span>
        </div>
        
        <div className="flex justify-between">
          <span>Cache Hit Rate:</span>
          <span className={getHitRateColor(cacheStats.hitRate)}>
            {(cacheStats.hitRate * 100).toFixed(1)}%
          </span>
        </div>
      </div>
      
      <button
        onClick={() => hiveClient?.clearCache()}
        className="mt-2 w-full bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
      >
        Clear Cache
      </button>
    </div>
  );
}; 