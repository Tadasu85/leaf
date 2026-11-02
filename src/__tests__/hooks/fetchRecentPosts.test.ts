import { fetchRecentPosts } from '../../hooks/useBuildApprovalQueue';

describe('fetchRecentPosts', () => {
  it('uses bridge.get_account_posts when available', async () => {
    const posts = [{ author: 'alice', permlink: 'a' }];
    const client: any = { call: jest.fn().mockResolvedValue(posts), database: { call: jest.fn() } };
    await expect(fetchRecentPosts(client, 'alice', 50)).resolves.toBe(posts);
    expect(client.call).toHaveBeenCalledWith('bridge', 'get_account_posts', { sort: 'posts', account: 'alice', limit: 50, observer: '' });
    expect(client.database.call).not.toHaveBeenCalled();
  });

  it('falls back to the blog feed and drops reblogs and replies', async () => {
    const client: any = {
      call: jest.fn().mockRejectedValue(new Error('no bridge')),
      database: {
        call: jest.fn().mockResolvedValue([
          { author: 'alice', permlink: 'mine', parent_author: '' },
          { author: 'bob', permlink: 'reblogged', parent_author: '' },
        ]),
      },
    };
    const result = await fetchRecentPosts(client, 'alice', 50);
    expect(result.map((p: any) => p.permlink)).toEqual(['mine']);
  });
});
