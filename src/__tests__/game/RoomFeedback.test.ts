import { EventEmitter } from 'events';
import { parseRoomDetails, isFeedbackComment, feedbackPermlink, feedbackBody } from '../../game/rooms/roomFeedback';
import { CommandParser } from '../../game/commands/CommandParser';
import { GameState } from '../../game/state/GameState';
import { HiveClient } from '../../game/blockchain/HiveClient';

jest.mock('../../utils/Logger', () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    signalingServer: 'https://srv',
    hive: { nodes: ['https://api.hive.test'] },
    game: { idName: 'ego-death', account: 'hive-109456', startRoom: { author: 'start-author', permlink: 'start-room' } },
    builders: [],
    admins: [],
  },
}));
jest.mock('../../game/network/SocketManager', () => ({
  SocketManager: jest.fn().mockImplementation(() => ({ on: jest.fn(), off: jest.fn(), destroy: jest.fn() })),
}));

describe('room details and feedback comments', () => {
  const comments = [
    { author: 'ray', permlink: 'bell-detail', body: 'bell: A small brass bell.' },
    { author: 'ray', permlink: 'plain', body: 'No colon here' },
    { author: 'someone', permlink: 'reply', body: 'window: not the author' },
    { author: 'ray', permlink: 'leaf-feedback-idea-abc', body: 'note: the author sent an idea' },
    { author: 'ray', permlink: 'tagged', body: 'tagged: feedback with metadata', json_metadata: '{"leaf_feedback":{"kind":"bug"}}' },
  ];

  it("reads only the author's non-feedback comments as details", () => {
    expect(parseRoomDetails('ray', comments)).toEqual({ bell: 'A small brass bell.', plain: 'No colon here' });
  });

  it('copes with no comments and bad metadata', () => {
    expect(parseRoomDetails('ray', null)).toEqual({});
    expect(isFeedbackComment({ author: 'ray', permlink: 'x', body: 'a: b', json_metadata: 'not json' })).toBe(false);
  });

  it('makes valid, distinct Hive permlinks', () => {
    const a = feedbackPermlink('idea', 1);
    const b = feedbackPermlink('idea', 2);
    expect(a).toMatch(/^leaf-feedback-idea-[a-z0-9]+-[a-z0-9]+$/);
    expect(a).not.toEqual(b);
  });

  it('writes a readable comment body', () => {
    expect(feedbackBody('typo', 'alice', 'The Glass Room', 'anicent → ancient')).toContain('**Typo report** from @alice in *The Glass Room*');
  });
});

describe('feedback commands', () => {
  const parse = (text: string) => new CommandParser().parse(text);
  it('parses typo, bug and idea', () => {
    expect(parse('idea a bench by the window')).toMatchObject({ type: 'feedback', args: ['idea', 'a bench by the window'] });
    expect(parse('bug north goes nowhere')).toMatchObject({ args: ['bug', 'north goes nowhere'] });
    expect(parse('typo')).toMatchObject({ args: ['typo', ''] });
  });
});

describe('HiveClient.postRoomFeedback', () => {
  it('posts a tagged reply on the room post', async () => {
    const broadcast = jest.fn().mockResolvedValue({ success: true });
    const permlink = await (HiveClient.prototype as any).postRoomFeedback.call(
      { keychain: { broadcast } }, 'alice', { author: 'ray', permlink: 'glass-room', title: 'The Glass Room' }, 'idea', 'more ferns');
    const [[opName, op]] = broadcast.mock.calls[0][0].operations;
    expect(opName).toBe('comment');
    expect(op).toMatchObject({ parent_author: 'ray', parent_permlink: 'glass-room', author: 'alice', permlink, title: '' });
    expect(JSON.parse(op.json_metadata)).toMatchObject({ tags: ['leaf-feedback'], leaf_feedback: { kind: 'idea' } });
    expect(op.body).toContain('more ferns');
  });

  it('throws when Keychain reports failure', async () => {
    const ctx = { keychain: { broadcast: jest.fn().mockResolvedValue({ success: false, message: 'cancelled' }) } };
    await expect((HiveClient.prototype as any).postRoomFeedback.call(ctx, 'alice', { author: 'r', permlink: 'p', title: 't' }, 'bug', 'x'))
      .rejects.toThrow('cancelled');
  });
});

describe('GameState.sendRoomFeedback', () => {
  let hiveClient: any;
  let gameState: GameState;
  const messages = () => gameState.getOutputMessages().map(m => m.output);

  beforeEach(() => {
    hiveClient = Object.assign(new EventEmitter(), { postRoomFeedback: jest.fn().mockResolvedValue('leaf-feedback-idea-x') });
    gameState = new GameState(hiveClient, new EventEmitter() as any);
    (gameState as any).player = { username: 'alice', location: null, isAdmin: false, isBuilder: false, characterDescription: '' };
    (gameState as any).currentRoom = { author: 'ray', permlink: 'glass-room', title: 'The Glass Room', players: [] };
  });

  it("sends the note to the room's author", async () => {
    await gameState.sendRoomFeedback('idea', 'more ferns');
    expect(hiveClient.postRoomFeedback).toHaveBeenCalledWith('alice', { author: 'ray', permlink: 'glass-room', title: 'The Glass Room' }, 'idea', 'more ferns');
    expect(messages()).toContain('Sent your idea to ray as a comment on "The Glass Room". Hive will notify them.');
  });

  it('explains usage when the note is empty', async () => {
    await gameState.sendRoomFeedback('bug', '');
    expect(hiveClient.postRoomFeedback).not.toHaveBeenCalled();
    expect(messages().some(m => m.startsWith('Usage: bug <note>'))).toBe(true);
  });

  it('tells guests it needs a Hive account', async () => {
    (gameState as any).player.isGuest = true;
    await gameState.sendRoomFeedback('idea', 'more ferns');
    expect(hiveClient.postRoomFeedback).not.toHaveBeenCalled();
    expect(messages()).toContain('Feedback goes to the room's author as a Hive comment, so it needs a Hive account. Type 'signup' to find out how to get one.');
  });

  it('limits how often feedback can be sent', async () => {
    await gameState.sendRoomFeedback('idea', 'one');
    await gameState.sendRoomFeedback('idea', 'two');
    expect(hiveClient.postRoomFeedback).toHaveBeenCalledTimes(1);
    expect(messages()).toContain('Please wait a few seconds before sending more feedback.');
  });

  it('reports a failed post and lets the player retry straight away', async () => {
    hiveClient.postRoomFeedback.mockRejectedValueOnce(new Error('cancelled'));
    await gameState.sendRoomFeedback('typo', 'x');
    expect(messages()).toContain("Couldn't send your feedback: cancelled");
    await gameState.sendRoomFeedback('typo', 'x');
    expect(hiveClient.postRoomFeedback).toHaveBeenCalledTimes(2);
  });
});
