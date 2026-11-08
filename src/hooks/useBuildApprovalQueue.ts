import { useCallback } from 'react';
import { Client } from '@hiveio/dhive';
import config from '../config';
import logger from '../utils/Logger';
import { fetchRecentPosts, findPendingRooms } from '../game/rooms/pendingRooms';

// Shared with the Build modal's limit check (game/rooms/pendingRooms).
export { fetchRecentPosts };

export function useBuildApprovalQueue(client: Client) {
  const buildApprovalQueue = useCallback(async (): Promise<any[]> => {
    try {
      logger.info('[Build Queue] Starting queue build...');

      const gameAccount = await client.database.getAccounts([config.game.account]);
      if (!gameAccount || !gameAccount[0]) {
        logger.error('[Build Queue] Failed to fetch game account data');
        return [];
      }

      const currentMetadata = JSON.parse(gameAccount[0].posting_json_metadata);
      const existingRooms = currentMetadata.egodeathgamedata?.rooms_authors_exits || {};
      logger.debug('[Build Queue] Existing rooms:', Object.keys(existingRooms));

      const communityDetailsArray = await client.hivemind.getCommunity({
        name: config.game.account,
        observer: ''
      });
      const communityDetails = Array.isArray(communityDetailsArray) ? communityDetailsArray[0] : communityDetailsArray;

      if (!communityDetails || !communityDetails.team) {
        logger.error('[Build Queue] Failed to fetch community team data');
        return [];
      }

      const builders: string[] = communityDetails.team
        .filter((member: any) => member[2] === 'Builder')
        .map((member: any) => member[0]);

      logger.debug('[Build Queue] Found builders:', builders);

      const pendingRooms: any[] = [];

      for (const builder of builders) {
        try {
          // Fetch the builder's recent top-level posts directly. The old approach
          // scanned the last 50 account-history ops, so votes, moves and other
          // activity could push room posts out of view.
          for (const { content, metadata } of await findPendingRooms(client, builder, existingRooms)) {
            const connection = metadata.connection || {};
            pendingRooms.push({
              id: `${builder}-${content.permlink}-${content.created}`,
              username: builder,
              room: connection.fromRoom || { author: builder, permlink: content.permlink },
              newRoom: { author: builder, permlink: content.permlink },
              title: content.title,
              body: content.body,
              timestamp: new Date(content.created).getTime(),
              status: 'pending',
              timeEvent: metadata.timeEvent || null,
              exits: {
                fromNewRoom: connection.exitFromNewRoom
                  ? { [connection.exitFromNewRoom]: connection.fromRoom?.permlink || '' }
                  : {},
                fromCurrentRoom: connection.exitToNewRoom
                  ? { [connection.exitToNewRoom]: content.permlink }
                  : {}
              }
            });
          }
        } catch (error) {
          logger.error(`[Build Queue] Error fetching posts for builder ${builder}:`, error);
        }
      }

      logger.debug('[Build Queue] Final pending rooms:', pendingRooms);
      return pendingRooms;
    } catch (error) {
      logger.error('[Build Queue] Error building approval queue:', error);
      return [];
    }
  }, [client]);

  return { buildApprovalQueue };
}
