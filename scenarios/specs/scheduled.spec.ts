import {
  NO_TARGET,
  RUN_ID,
  UNAVAILABLE,
  channelFor,
  cleanup,
  expect,
  expectPublished,
  expectReleaseReachable,
  gate,
  recordMetric,
  test,
  textPost,
} from '../fixtures';

const DUE_IN = 15 * 60_000;

test.describe('scheduled post', { tag: '@publish' }, () => {
  test.skip(!gate.url || !gate.apiKey, NO_TARGET);

  test('a post scheduled 15 minutes out publishes on time', { tag: '@scheduled' }, async ({
    postiz,
    request,
  }, testInfo) => {
    test.setTimeout(DUE_IN + 20 * 60_000);
    const channel = channelFor('telegram', 'bluesky');
    test.skip(!channel, `${UNAVAILABLE}: telegram, bluesky`);

    const publishDate = new Date(Date.now() + DUE_IN);
    const content = `Postiz reliability check ${RUN_ID}: scheduled for ${publishDate.toISOString()}.`;

    const [created] = await test.step('schedule the post', () =>
      postiz.create(textPost('schedule', channel!.id, content, publishDate))
    );

    let releaseURL: string | null = null;
    try {
      await test.step('it is still queued before its date', async () => {
        expect((await postiz.post(created.postId))?.state).toBe('QUEUE');
      });

      // There is no published-at field, so lateness is bounded by the 30s poll.
      const { post, settledAt } = await test.step('wait until it leaves QUEUE', () =>
        postiz.waitForSettled(created.postId, DUE_IN + 15 * 60_000, 30_000)
      );
      releaseURL = post.releaseURL;

      await test.step('it is PUBLISHED with a release URL', () => expectPublished(post));

      await test.step('the release URL is reachable', () =>
        expectReleaseReachable(request, testInfo, releaseURL!)
      );
      recordMetric(testInfo, 'scheduling_lateness_ms', settledAt - publishDate.getTime());
    } finally {
      await test.step('cleanup', () =>
        cleanup(postiz, testInfo, created.postId, channel!, releaseURL)
      );
    }
  });
});
