import { prisma } from '@reliability/db/prisma';
import { BatchCommit, compareCommits } from '@reliability/core/integrations/github';
import { analyzeFailures } from '@reliability/core/integrations/ai';
import { sendEmail } from '@reliability/core/integrations/email';

const loadRun = (runId: string) =>
  prisma.run.findUniqueOrThrow({
    where: { id: runId },
    include: {
      batch: true,
      scenarioRuns: { include: { scenario: true }, orderBy: { createdAt: 'asc' } },
    },
  });

const finalFailures = (run: Awaited<ReturnType<typeof loadRun>>) => {
  const latest = new Map<string, (typeof run.scenarioRuns)[number]>();
  for (const sr of run.scenarioRuns) {
    latest.set(sr.scenarioId, sr);
  }
  return [...latest.values()]
    .filter((sr) => ['FAILED', 'TIMED_OUT'].includes(sr.status))
    .map((sr) => ({ key: sr.scenario.key, error: sr.error, classification: sr.classification }));
};

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function analyzeRun(input: { runId: string }) {
  const run = await loadRun(input.runId);
  const commits = (run.batch?.commits || []) as BatchCommit[];
  const files =
    run.batch?.baseSha && run.batch.headSha
      ? (await compareCommits(run.batch.baseSha, run.batch.headSha).catch(() => null))?.files || []
      : [];
  const aiAnalysis = await analyzeFailures({
    commits,
    files,
    failures: [
      ...finalFailures(run),
      ...(run.error ? [{ key: 'deploy', error: run.error }] : []),
    ],
  });
  await prisma.run.update({
    where: { id: run.id },
    data: { aiAnalysis },
    select: { id: true },
  });
}

export async function notifyRed(input: { runId: string }) {
  const run = await loadRun(input.runId);
  const recipients = (
    await prisma.member.findMany({
      where: { role: 'ADMIN', deletedAt: null },
      select: { email: true },
    })
  ).map((m) => m.email);

  const commits = (run.batch?.commits || []) as BatchCommit[];
  const failures = finalFailures(run);
  const subject = `[Postiz Reliability] Red run on ${run.batch?.headSha.slice(0, 7) || 'unknown'} (${(run.classification || 'unclassified').toLowerCase()})`;
  const body = [
    `<p><a href="${process.env.APP_URL}/runs/${run.id}">Open the run</a></p>`,
    run.error ? `<h3>Deploy</h3><pre>${escape(run.error)}</pre>` : '',
    failures.length
      ? `<h3>Failures</h3><ul>${failures
          .map((f) => `<li><b>${escape(f.key)}</b> (${f.classification || 'unclassified'})<pre>${escape(f.error || '')}</pre></li>`)
          .join('')}</ul>`
      : '',
    `<h3>Batch commits</h3><ul>${commits
      .map((c) => `<li><a href="${c.url}">${c.sha.slice(0, 7)}</a> ${escape(c.message)} (${escape(c.author)})</li>`)
      .join('')}</ul>`,
    run.aiAnalysis ? `<h3>AI analysis (advisory)</h3><p>${escape(run.aiAnalysis)}</p>` : '',
  ].join('');

  let status: 'LOGGED' | 'SENT' | 'FAILED' = 'FAILED';
  let error: string | null = null;
  try {
    status = (await sendEmail(recipients, subject, body)).transport === 'log' ? 'LOGGED' : 'SENT';
  } catch (err) {
    error = (err as Error).message;
  }

  await prisma.notification.create({
    data: { runId: run.id, channel: 'email', recipients, subject, body, status, error },
    select: { id: true },
  });
  await prisma.run.update({
    where: { id: run.id },
    data: { phase: 'DONE' },
    select: { id: true },
  });
}
