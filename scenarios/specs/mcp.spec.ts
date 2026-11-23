import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
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
} from '../fixtures';

const toolOutput = (result: Awaited<ReturnType<Client['callTool']>>) => {
  if (result.structuredContent) {
    return result.structuredContent as any;
  }
  const [first] = (result.content as Array<{ type: string; text?: string }>) || [];
  return JSON.parse(first?.text || '{}');
};

test.describe('MCP', { tag: '@mcp' }, () => {
  test.skip(!gate.mcpUrl || !gate.apiKey, NO_TARGET);

  test('schedules a post through MCP and it publishes', { tag: '@publish' }, async ({
    postiz,
    request,
  }, testInfo) => {
    const channel = channelFor('telegram', 'bluesky');
    test.skip(!channel, `${UNAVAILABLE}: telegram, bluesky`);

    // The key is part of the path, so it reaches the target's HTTP logs: use
    // keys that exist only for the test org.
    const transport = new StreamableHTTPClientTransport(
      new URL(`${gate.mcpUrl}/${gate.apiKey}`)
    );
    const client = new Client({ name: 'Postiz Reliability', version: '1.0.0' });

    let postId: string | undefined;
    let releaseURL: string | null = null;
    try {
      await test.step('connect and list tools', async () => {
        await client.connect(transport, { timeout: 30_000 });
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name);
        expect(names).toContain('integrationList');
        expect(names).toContain('integrationSchedulePostTool');
      });

      await test.step('integrationList returns the test channel', async () => {
        const output = toolOutput(
          await client.callTool({ name: 'integrationList', arguments: {} })
        );
        const ids = (output.output || []).map((i: { id: string }) => i.id);
        expect(ids, `integrationList did not return ${channel!.id}`).toContain(channel!.id);
      });

      const startedAt = Date.now();
      await test.step('integrationSchedulePostTool publishes now', async () => {
        const output = toolOutput(
          await client.callTool({
            name: 'integrationSchedulePostTool',
            arguments: {
              socialPost: [
                {
                  integrationId: channel!.id,
                  isPremium: false,
                  date: new Date().toISOString(),
                  shortLink: false,
                  type: 'now',
                  postsAndComments: [
                    {
                      content: `<p>Postiz reliability check ${RUN_ID}: posted through MCP.</p>`,
                      attachments: [],
                    },
                  ],
                  settings: [],
                },
              ],
            },
          })
        );
        expect(output.output?.errors, 'integrationSchedulePostTool returned errors').toBeFalsy();
        postId = output.output?.[0]?.postId;
        expect(postId, `integrationSchedulePostTool created no post: ${JSON.stringify(output)}`).toBeTruthy();
      });

      const { post, settledAt } = await test.step('the public API sees it leave QUEUE', () =>
        postiz.waitForSettled(postId!, 10 * 60_000, 5_000)
      );
      releaseURL = post.releaseURL;
      recordMetric(testInfo, 'publish_latency_ms', settledAt - startedAt);

      await test.step('it is PUBLISHED with a release URL', () => expectPublished(post));

      await test.step('the release URL is reachable', () =>
        expectReleaseReachable(request, testInfo, releaseURL!)
      );
    } finally {
      if (postId) {
        await test.step('cleanup', () => cleanup(postiz, testInfo, postId!, channel!, releaseURL));
      }
      if (transport.sessionId) {
        await transport.terminateSession().catch(() => {});
      }
      await client.close().catch(() => {});
    }
  });
});
