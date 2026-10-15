export const sendEmail = async (to: string[], subject: string, html: string) => {
  console.log(`[email:log] to=${to.join(',')} subject="${subject}" (${html.length} chars)`);
  return { transport: 'log' as const };
};
