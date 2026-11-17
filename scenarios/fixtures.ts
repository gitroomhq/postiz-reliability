import {
  test as base,
  expect,
  type APIRequestContext,
  type TestInfo,
} from '@playwright/test';
import { getPlatform } from '@reliability/core/platforms/platform.list';
import { NO_TARGET, UNAVAILABLE } from '@reliability/core/scenario.constants';

export type GateChannel = {
  provider: string;
  id: string;
  credentials?: Record<string, string>;
};

const parseList = <T>(value: string | undefined): T[] => {
  try {
    return JSON.parse(value || '[]');
  } catch {
    return [];
  }
};

const url = (process.env.POSTIZ_SMOKE_URL ?? '').replace(/\/+$/, '');

export const gate = {
  url,
  apiKey: process.env.POSTIZ_SMOKE_API_KEY ?? '',
  mcpUrl: (process.env.POSTIZ_SMOKE_MCP_URL || (url && `${url}/mcp`)).replace(
    /\/+$/,
    ''
  ),
  channels: parseList<GateChannel>(process.env.POSTIZ_SMOKE_CHANNELS),
  forceFail: parseList<string>(process.env.RELIABILITY_FORCE_FAIL),
};

export const RUN_ID =
  process.env.RELIABILITY_RUN_ID ||
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export { NO_TARGET, UNAVAILABLE };

export const channelFor = (...providers: string[]) =>
  providers
    .map((provider) => gate.channels.find((c) => c.provider === provider))
    .find(Boolean);

export type Channel = {
  id: string;
  name: string;
  identifier: string;
  disabled: boolean;
};

export type RemotePost = {
  id: string;
  group: string;
  state: 'QUEUE' | 'PUBLISHED' | 'ERROR' | 'DRAFT';
  publishDate: string;
  releaseURL: string | null;
  error: string | null;
  content: string;
  integration: { id: string; providerIdentifier: string; name: string };
};

const readRange = () => ({
  startDate: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  endDate: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
});

export const recordMetric = (testInfo: TestInfo, metric: string, value: number) => {
  testInfo.annotations.push({ type: `metric:${metric}`, description: String(value) });
};

export const textPost = (
  type: 'draft' | 'now' | 'schedule',
  channelId: string,
  content: string,
  date = new Date(),
  image: Array<{ id: string; path: string }> = []
) => ({
  type,
  shortLink: false,
  tags: [] as string[],
  date: date.toISOString(),
  posts: [
    { integration: { id: channelId }, value: [{ content, image }], settings: {} },
  ],
});

export class PostizClient {
  constructor(private request: APIRequestContext) {}

  private get headers() {
    return { Authorization: gate.apiKey, 'Content-Type': 'application/json' };
  }

  async channels(): Promise<Channel[]> {
    const response = await this.request.get(`${gate.url}/public/v1/integrations`, {
      headers: this.headers,
    });
    expect(
      response.ok(),
      `GET /public/v1/integrations failed: ${response.status()} ${await response.text()}`
    ).toBeTruthy();
    return response.json();
  }

  async posts(): Promise<RemotePost[]> {
    const response = await this.request.get(`${gate.url}/public/v1/posts`, {
      headers: this.headers,
      params: readRange(),
    });
    expect(
      response.ok(),
      `GET /public/v1/posts failed: ${response.status()} ${await response.text()}`
    ).toBeTruthy();
    const { posts } = await response.json();
    return posts;
  }

  async post(id: string): Promise<RemotePost | undefined> {
    return (await this.posts()).find((p) => p.id === id);
  }

  async attemptCreate(body: Record<string, unknown>) {
    const response = await this.request.post(`${gate.url}/public/v1/posts`, {
      headers: this.headers,
      data: body,
    });
    const text = await response.text();
    return { ok: response.ok(), status: response.status(), text };
  }

  async create(body: Record<string, unknown>) {
    const { ok, status, text } = await this.attemptCreate(body);
    expect(ok, `POST /public/v1/posts failed: ${status} ${text}`).toBeTruthy();
    return JSON.parse(text) as Array<{ postId: string; integration: string }>;
  }

  async upload(name: string, mimeType: string, buffer: Buffer) {
    const response = await this.request.post(`${gate.url}/public/v1/upload`, {
      headers: { Authorization: gate.apiKey },
      multipart: { file: { name, mimeType, buffer } },
    });
    expect(
      response.ok(),
      `POST /public/v1/upload failed: ${response.status()} ${await response.text()}`
    ).toBeTruthy();
    return (await response.json()) as { id: string; path: string };
  }

  /**
   * Polls until the post leaves QUEUE. `settledAt` is the first poll that saw
   * it settled, so its precision is bounded by the interval.
   */
  async waitForSettled(id: string, timeout: number, interval: number) {
    let settled: RemotePost | undefined;
    let settledAt = 0;
    await expect
      .poll(
        async () => {
          const post = await this.post(id);
          if (post && post.state !== 'QUEUE') {
            settled = post;
            settledAt = Date.now();
          }
          return post?.state;
        },
        { timeout, intervals: [interval], message: `waiting for post ${id} to leave QUEUE` }
      )
      .not.toBe('QUEUE');
    return { post: settled!, settledAt };
  }

  async remove(id: string): Promise<boolean> {
    try {
      const response = await this.request.delete(
        `${gate.url}/public/v1/posts/${id}`,
        { headers: this.headers }
      );
      return response.ok();
    } catch {
      return false;
    }
  }
}

export const expectPublished = (post: RemotePost) => {
  expect(post.state, `post ${post.id} ended as ${post.state}: ${post.error || ''}`).toBe(
    'PUBLISHED'
  );
  expect(post.releaseURL, `post ${post.id} published without a release URL`).toBeTruthy();
};

// Private Telegram channels and Discord need a member's login, and Facebook
// serves logged-out visitors a page without the post's text
const PRIVATE_RELEASE_URL =
  /^https:\/\/(t\.me\/(c\/|-)|discord\.com\/channels\/|(www\.)?facebook\.com\/)/;

// bsky.app answers 200 for any post path, so only the post's text proves it is live
export const expectReleaseReachable = async (
  request: APIRequestContext,
  testInfo: TestInfo,
  releaseURL: string
) => {
  if (PRIVATE_RELEASE_URL.test(releaseURL)) {
    testInfo.annotations.push({
      type: 'release-url-unchecked',
      description: `${releaseURL} is not publicly viewable`,
    });
    return;
  }
  await expect
    .poll(
      async () => {
        const response = await request.get(releaseURL, {
          timeout: 30_000,
          failOnStatusCode: false,
        });
        return response.ok() && (await response.text()).includes(RUN_ID);
      },
      { timeout: 2 * 60_000, intervals: [10_000], message: `${releaseURL} does not show the post` }
    )
    .toBe(true);
};

/**
 * Removes the post from Postiz and, where the platform supports it cheaply,
 * from the network. Never throws, so it cannot mask the failure it unwinds.
 */
export const cleanup = async (
  postiz: PostizClient,
  testInfo: TestInfo,
  postId: string,
  channel: GateChannel,
  releaseURL?: string | null
) => {
  const platform = getPlatform(channel.provider);
  if (releaseURL && platform && channel.credentials) {
    const removed = await platform.remove(channel.credentials, releaseURL);
    if (!removed.ok) {
      testInfo.annotations.push({
        type: 'cleanup-failed',
        description: `${releaseURL} is still on ${channel.provider}${removed.error ? ` (${removed.error})` : ''}`,
      });
    }
  }
  if (!(await postiz.remove(postId))) {
    testInfo.annotations.push({
      type: 'cleanup-failed',
      description: `post ${postId} is still in Postiz`,
    });
  }
};

export const test = base.extend<{ postiz: PostizClient; forceFail: void }>({
  postiz: async ({ request }, use) => {
    await use(new PostizClient(request));
  },
  // Fault injection: Scenario.forceFail fails the spec before it publishes anything
  forceFail: [
    async ({}, use, testInfo) => {
      expect(
        gate.forceFail.includes(testInfo.titlePath.slice(1).join(' › ')),
        'forced failure (Scenario.forceFail)'
      ).toBe(false);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
