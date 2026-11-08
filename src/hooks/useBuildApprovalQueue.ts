import { useCallback } from 'react';
import { Client } from '@hiveio/dhive';
import config from '../config';
import logger from '../utils/Logger';
import { findRoom } from '../game/rooms/mapKeys';

const POSTS_PER_BUILDER = 50;

/**
 * Returns a builder's most recent top-level posts (newest first), excluding
 * reblogs. Uses bridge.get_account_posts, falling back to
 * condenser get_discussions_by_blog filtered to the builder's own posts.
 */
export async function fetchRecentPosts(client: Client, account: string, limit: number): Promise<any[]> {
  try {
    const posts = await client.call('bridge', 'get_account_posts', { sort: 'posts', account, limit, observer: '' });
    if (Array.isArray(posts)) return posts;
  } catch (error) {
    logger.warn(`[Build Queue] bridge.get_account_posts failed for ${account}, falling back:`, error);
  }
  const blog = await client.database.call('get_discussions_by_blog', [{ tag: account, limit: Math.min(limit, 100) }]);
  return (Array.isArray(blog) ? blog : []).filter((p: any) => p.author === account && !p.parent_author);
}

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
          const recentPosts = await fetchRecentPosts(client, builder, POSTS_PER_BUILDER);

          for (const content of recentPosts) {
            try {
              if (content && content.json_metadata) {
                try {
                  const metadata = typeof content.json_metadata === 'string'
                    ? JSON.parse(content.json_metadata)
                    : content.json_metadata;

                  if (
                    (metadata.app === config.game.idName || metadata.app === 'leaf') &&
                    (!metadata.type || metadata.type === 'room') &&
                    // Same permlink by another author is a different room
                    !findRoom(existingRooms, builder, content.permlink)
                  ) {
                    let isRejected = false;

                    try {
                      const comments = await client.database.call('get_content_replies', [builder, content.permlink]);
                      const adminComments = comments?.filter((c: any) => c.author === config.game.account) || [];
                      isRejected = adminComments.some((c: any) => c.body.startsWith('Rejected:'));
                    } catch (error) {
                      logger.error('[Build Queue] Error checking rejection comments:', error);
                    }

                    if (!isRejected) {
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
                  }
                } catch (error) {
                  logger.error('[Build Queue] Error parsing post metadata:', error);
                }
              }
            } catch (error) {
              logger.error('[Build Queue] Error fetching post content:', error);
            }
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
