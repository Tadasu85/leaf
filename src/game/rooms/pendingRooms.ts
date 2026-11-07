import { Client } from '@hiveio/dhive';
import config from '../../config';
import logger from '../../utils/Logger';

/**
 * Rooms waiting in the Builder Queue, and the per-builder limit on them
 * (from LambdaMOO's building quota: keeps the Queue reviewable and the
 * world from sprawling).
 *
 * A room is waiting when it is one of the builder's room posts, it isn't on
 * the map yet, and the game account hasn't replied "Rejected: ...".
 *
 * The limit is DEFAULT_PENDING_ROOM_LIMIT unless the admin sets one for a
 * builder in the game account metadata:
 *   egodeathgamedata.builderLimits = { "<builder>": <number> }
 */

export const DEFAULT_PENDING_ROOM_LIMIT = 3;
const POSTS_PER_BUILDER = 50;

/**
 * A builder's most recent top-level posts (newest first), excluding
 * reblogs. Uses bridge.get_account_posts, falling back to condenser
 * get_discussions_by_blog filtered to the builder's own posts.
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

export interface PendingRoomPost {
  content: any;
  metadata: any;
}

/** The builder's room posts that are waiting for approval. */
export async function findPendingRooms(
  client: Client,
  builder: string,
  existingRooms: Record<string, unknown>
): Promise<PendingRoomPost[]> {
  const pending: PendingRoomPost[] = [];
  const recentPosts = await fetchRecentPosts(client, builder, POSTS_PER_BUILDER);
  for (const content of recentPosts) {
    if (!content || !content.json_metadata) continue;
    let metadata: any;
    try {
      metadata = typeof content.json_metadata === 'string' ? JSON.parse(content.json_metadata) : content.json_metadata;
    } catch (error) {
      logger.error('[Build Queue] Error parsing post metadata:', error);
      continue;
    }
    const isRoom = (metadata?.app === config.game.idName || metadata?.app === 'leaf') && (!metadata.type || metadata.type === 'room');
    if (!isRoom || existingRooms[content.permlink]) continue;

    let isRejected = false;
    try {
      const comments = await client.database.call('get_content_replies', [builder, content.permlink]);
      const adminComments = comments?.filter((c: any) => c.author === config.game.account) || [];
      isRejected = adminComments.some((c: any) => c.body.startsWith('Rejected:'));
    } catch (error) {
      logger.error('[Build Queue] Error checking rejection comments:', error);
    }
    if (!isRejected) pending.push({ content, metadata });
  }
  return pending;
}

/** The limit for one builder: the admin's override if set, else the default. */
export function pendingRoomLimitFor(gameData: any, builder: string): number {
  const override = gameData?.builderLimits?.[builder];
  return Number.isInteger(override) && override >= 0 ? override : DEFAULT_PENDING_ROOM_LIMIT;
}

export interface PendingRoomStatus {
  pending: number;
  limit: number;
  atLimit: boolean;
}

/** How many rooms this builder has waiting, and their limit. */
export async function getPendingRoomStatus(client: Client, builder: string): Promise<PendingRoomStatus> {
  const accounts = await client.database.getAccounts([config.game.account]);
  const raw = accounts?.[0]?.posting_json_metadata;
  let gameData: any = {};
  try {
    gameData = raw ? JSON.parse(raw).egodeathgamedata ?? {} : {};
  } catch {
    gameData = {};
  }
  const pending = (await findPendingRooms(client, builder, gameData.rooms_authors_exits || {})).length;
  const limit = pendingRoomLimitFor(gameData, builder);
  return { pending, limit, atLimit: pending >= limit };
}
