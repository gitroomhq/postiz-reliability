import { google } from 'googleapis';

const redirectUri = () => `${process.env.APP_URL}/api/auth/google/callback`;

const makeClient = () =>
  new google.auth.OAuth2({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: redirectUri(),
  });

export const generateLink = () =>
  makeClient().generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    state: 'login',
    hd: 'postiz.com',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });

export const getGoogleUser = async (code: string) => {
  const client = makeClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials({ access_token: tokens.access_token });
  const { data } = await google
    .oauth2({ version: 'v2', auth: client })
    .userinfo.get();
  return { email: data.email || '', verified: !!data.verified_email };
};
