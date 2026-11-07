/**
 * Room details and room feedback both live as Hive comments on a room's post.
 *
 * Details: the room author's comments, formatted `key: text`; `look key`
 * shows them. Feedback: comments sent with the `typo`, `bug` and `idea`
 * commands. Feedback is tagged so it is never read as a detail, even when
 * the room's own author sends it.
 */

export type FeedbackKind = 'typo' | 'bug' | 'idea';

export const FEEDBACK_KINDS: FeedbackKind[] = ['typo', 'bug', 'idea'];
export const FEEDBACK_PERMLINK_PREFIX = 'leaf-feedback-';

const FEEDBACK_LABELS: Record<FeedbackKind, string> = {
  typo: 'Typo report',
  bug: 'Bug report',
  idea: 'Idea'
};

interface HiveComment {
  author: string;
  permlink: string;
  body: string;
  json_metadata?: string;
}

export const isFeedbackComment = (comment: HiveComment): boolean => {
  if (comment.permlink?.startsWith(FEEDBACK_PERMLINK_PREFIX)) return true;
  try {
    const meta = comment.json_metadata ? JSON.parse(comment.json_metadata) : null;
    return Boolean(meta && typeof meta === 'object' && meta.leaf_feedback);
  } catch {
    return false;
  }
};

/** The room's `look` details from its comments. */
export const parseRoomDetails = (author: string, comments: HiveComment[] | null | undefined): Record<string, string> => {
  const details: Record<string, string> = {};
  for (const comment of comments ?? []) {
    if (comment.author !== author || isFeedbackComment(comment)) continue;
    const colonIndex = comment.body.indexOf(':');
    const key = colonIndex > 0 ? comment.body.substring(0, colonIndex).trim() : comment.permlink;
    const body = colonIndex > 0 ? comment.body.substring(colonIndex + 1).trim() : comment.body;
    details[key] = body;
  }
  return details;
};

export const feedbackPermlink = (kind: FeedbackKind, now: number = Date.now()): string =>
  `${FEEDBACK_PERMLINK_PREFIX}${kind}-${now.toString(36)}-${Math.floor(Math.random() * 36 ** 4).toString(36)}`;

export const feedbackBody = (kind: FeedbackKind, sender: string, roomTitle: string, text: string): string =>
  `**${FEEDBACK_LABELS[kind]}** from @${sender} in *${roomTitle}*:\n\n${text}\n\n<sub>Sent from Leaf with the \`${kind}\` command.</sub>`;
