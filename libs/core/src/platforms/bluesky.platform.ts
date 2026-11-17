import { Platform } from '@reliability/core/platforms/platform.interface';

const service = (credentials: Record<string, string>) =>
  (credentials.service || 'https://bsky.social').replace(/\/+$/, '');

const createSession = async (credentials: Record<string, string>) => {
  const response = await fetch(
    `${service(credentials)}/xrpc/com.atproto.server.createSession`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: credentials.identifier,
        password: credentials.appPassword,
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Bluesky login failed: ${response.status}`);
  }
  return (await response.json()) as { did: string; accessJwt: string };
};

export const blueskyPlatform: Platform = {
  identifier: 'bluesky',
  fields: [
    { key: 'identifier', label: 'Handle', secret: false },
    { key: 'appPassword', label: 'App password', secret: true },
  ],
  async check(credentials) {
    try {
      await createSession(credentials);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
  async remove(credentials, releaseURL) {
    const rkey = releaseURL.split('/post/')[1]?.split(/[/?#]/)[0];
    if (!rkey) {
      return { ok: false, error: 'no record key in the URL' };
    }
    try {
      const session = await createSession(credentials);
      const response = await fetch(
        `${service(credentials)}/xrpc/com.atproto.repo.deleteRecord`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessJwt}`,
          },
          body: JSON.stringify({
            repo: session.did,
            collection: 'app.bsky.feed.post',
            rkey,
          }),
        }
      );
      return response.ok
        ? { ok: true }
        : { ok: false, error: `deleteRecord failed: ${response.status}` };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};
