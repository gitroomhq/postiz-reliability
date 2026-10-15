import {
  NO_TARGET,
  RUN_ID,
  UNAVAILABLE,
  channelFor,
  cleanup,
  expectPublished,
  expectReleaseReachable,
  gate,
  recordMetric,
  test,
  textPost,
} from '../fixtures';

// Each test publishes a real post that stays on the network unless the
// platform supports a cheap delete, so channels must be dedicated accounts.
test.describe('tier 3: publish now (text)', { tag: '@publish' }, () => {
  test.skip(!gate.url || !gate.apiKey, NO_TARGET);

  for (const provider of ['bluesky', 'telegram', 'facebook', 'linkedin-page', 'discord']) {
    test(`publishes a text post on ${provider}`, { tag: `@${provider}` }, async ({
      postiz,
      request,
    }, testInfo) => {
      const channel = channelFor(provider);
      test.skip(!channel, `${UNAVAILABLE}: ${provider}`);

      const content = `Postiz reliability check ${RUN_ID}: publish now on ${provider}.`;
      const startedAt = Date.now();

      const [created] = await test.step('create the post', () =>
        postiz.create(textPost('now', channel!.id, content))
      );

      let releaseURL: string | null = null;
      try {
        const { post, settledAt } = await test.step('wait until it leaves QUEUE', () =>
          postiz.waitForSettled(created.postId, 10 * 60_000, 5_000)
        );
        releaseURL = post.releaseURL;
        recordMetric(testInfo, 'publish_latency_ms', settledAt - startedAt);

        await test.step('it is PUBLISHED with a release URL', () => expectPublished(post));

        await test.step('the release URL is reachable', () =>
          expectReleaseReachable(request, testInfo, releaseURL!)
        );
      } finally {
        await test.step('cleanup', () =>
          cleanup(postiz, testInfo, created.postId, channel!, releaseURL)
        );
      }
    });
  }
});
