import { readFileSync } from 'fs';
import { join } from 'path';
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

test.describe('publish now with an image', { tag: '@publish' }, () => {
  test.skip(!gate.url || !gate.apiKey, NO_TARGET);

  test('uploads an image and publishes it', { tag: '@media' }, async ({
    postiz,
    request,
  }, testInfo) => {
    const channel = channelFor('telegram', 'bluesky');
    test.skip(!channel, `${UNAVAILABLE}: telegram, bluesky`);

    const media = await test.step('upload the image', () =>
      postiz.upload(
        `reliability-${RUN_ID}.png`,
        'image/png',
        readFileSync(join(__dirname, '..', 'fixtures', 'gradient.png'))
      )
    );

    const content = `Postiz reliability check ${RUN_ID}: publish now with an image.`;
    const startedAt = Date.now();

    const [created] = await test.step('create the post', () =>
      postiz.create(
        textPost('now', channel!.id, content, new Date(), [{ id: media.id, path: media.path }])
      )
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
});
