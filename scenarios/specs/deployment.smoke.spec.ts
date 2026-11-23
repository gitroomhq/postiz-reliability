import { NO_TARGET, RUN_ID, expect, gate, test, textPost } from '../fixtures';

test.describe('tier 1: the deployment answers', { tag: '@tier1' }, () => {
  test.skip(!gate.url, NO_TARGET);

  test('the backend is serving', async ({ request }) => {
    const response = await request.get(`${gate.url}/`, { timeout: 30_000 });

    expect(response.status(), `${gate.url}/ returned ${response.status()}`).toBeLessThan(500);
  });

  test('the public API refuses a request with no key', async ({ request }) => {
    const response = await request.get(`${gate.url}/public/v1/integrations`);

    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ msg: 'No API Key found' });
  });

  test('the public API refuses a wrong key', async ({ request }) => {
    const response = await request.get(`${gate.url}/public/v1/integrations`, {
      headers: { Authorization: `definitely-not-a-key-${RUN_ID}` },
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ msg: 'Invalid API key' });
  });

  test('a bogus OAuth-shaped token is rejected as an OAuth token', async ({ request }) => {
    // "pos_" routes down a different branch of PublicAuthMiddleware
    const response = await request.get(`${gate.url}/public/v1/integrations`, {
      headers: { Authorization: `pos_${RUN_ID}` },
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ msg: 'Invalid OAuth token' });
  });
});

test.describe('tier 2: the API key works and posts round-trip', { tag: '@tier2' }, () => {
  test.skip(!gate.url || !gate.apiKey, NO_TARGET);

  test('the key authenticates', async ({ request }) => {
    const response = await request.get(`${gate.url}/public/v1/is-connected`, {
      headers: { Authorization: gate.apiKey },
    });

    expect(
      response.ok(),
      `the API key was rejected: ${response.status()} ${await response.text()}`
    ).toBeTruthy();
    expect(await response.json()).toEqual({ connected: true });
  });

  test('every configured test channel exists and is enabled', async ({ postiz }) => {
    const channels = await postiz.channels();
    const byId = new Map(channels.map((c) => [c.id, c]));

    expect(channels.length, 'the test org has no channels connected at all').toBeGreaterThan(0);

    for (const { id, provider } of gate.channels) {
      const channel = byId.get(id);
      expect(
        channel,
        `${provider} channel ${id} does not exist on this deployment. Known channels: ${channels
          .map((c) => `${c.id} (${c.name})`)
          .join(', ')}`
      ).toBeTruthy();
      expect(channel!.disabled, `channel ${id} (${channel!.name}) is disabled`).toBeFalsy();
    }
  });

  test('a draft is created, listed and deleted', async ({ postiz }) => {
    // Channels are tried in turn: the public API runs each provider's settings
    // DTO even for a draft, so a provider that demands settings rejects it.
    const channels = await postiz.channels();
    const preferred = gate.channels.map((c) => c.id);
    const candidates = [...channels].sort((a, b) => {
      const rank = (c: typeof a) => (preferred.includes(c.id) ? 0 : 2) + (c.disabled ? 1 : 0);
      return rank(a) - rank(b);
    });

    const content = `postiz reliability draft ${RUN_ID} - not published`;
    const date = new Date(Date.now() + 60 * 60 * 1000);

    const rejected: string[] = [];
    let created: { postId: string } | undefined;

    await test.step('create a draft', async () => {
      for (const channel of candidates) {
        const attempt = await postiz.attemptCreate(textPost('draft', channel.id, content, date));
        if (attempt.ok) {
          [created] = JSON.parse(attempt.text);
          break;
        }
        rejected.push(`${channel.name} (${channel.identifier}): ${attempt.status} ${attempt.text}`);
      }

      expect(
        created?.postId,
        `no channel on this deployment accepted a minimal draft. Tried:\n${rejected.join('\n')}`
      ).toBeTruthy();
    });

    try {
      await test.step('the draft is listed back', async () => {
        const found = await postiz.post(created!.postId);

        expect(found, 'the created draft was not listed back').toBeTruthy();
        expect(found!.state).toBe('DRAFT');
        expect(found!.content).toContain(RUN_ID);
        expect(found!.releaseURL).toBeFalsy();
      });
    } finally {
      await postiz.remove(created!.postId);
    }

    await test.step('the draft is gone after deletion', async () => {
      expect(
        await postiz.post(created!.postId),
        `draft ${created!.postId} survived deletion - remove it by hand`
      ).toBeFalsy();
    });
  });

  test('a post for an unknown channel is refused', async ({ postiz }) => {
    const content = `should never be created ${RUN_ID}`;

    const attempt = await postiz.attemptCreate(
      textPost('draft', `no-such-integration-${RUN_ID}`, content, new Date(Date.now() + 60 * 60 * 1000))
    );

    expect(attempt.status).toBe(400);
    expect((await postiz.posts()).some((p) => p.content.includes(content))).toBeFalsy();
  });
});
