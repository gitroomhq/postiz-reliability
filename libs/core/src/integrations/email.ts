import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

// Credentials come from the default AWS chain (the ECS task role on AWS)
const ses = new SESv2Client({ region: process.env.SES_REGION });

export const sendEmail = async (to: string[], subject: string, html: string) => {
  if (!process.env.SES_REGION || !process.env.EMAIL_FROM) {
    console.log(`[email:log] to=${to.join(',')} subject="${subject}" (${html.length} chars)`);
    return { transport: 'log' as const };
  }
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: `"Postiz Reliability" <${process.env.EMAIL_FROM}>`,
      Destination: { ToAddresses: to },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { Html: { Data: html, Charset: 'UTF-8' } },
        },
      },
    })
  );
  return { transport: 'ses' as const };
};
