# Postiz Reliability

- Use pnpm only.
- Follow postiz-app's patterns, and postiz-aws's for infrastructure, for anything that has a precedent there. Add nothing without a precedent unless the plan names it (Next.js API routes, a plain Temporal worker without NestJS, Playwright, the MCP client).
- Prisma only, never raw SQL. Schema changes go through `db push`.
- Tailwind 3 and native components; no UI component libraries from npm.
- SWR with one hook per request, never wrapped in eslint-disable.
- Never change a deployed workflow in place; add a new version.
- Never read `.env`, never log secrets, encrypt credentials at rest.
- Integrations stay dry-run unless live credentials are set. Nothing writes to postiz-app, postiz-aws, GitHub, AWS, gamma or prod outside the milestone that allows it.
- Minimal comments.
- Don't edit `reliability-*.md` or `requirements.md` unless asked.
- CodeRabbit doesn't review this repo automatically: after opening a PR, trigger it with a PR comment `@coderabbitai review`.
