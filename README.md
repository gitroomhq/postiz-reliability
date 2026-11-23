# Postiz Reliability

Tests each new [Postiz](https://github.com/gitroomhq/postiz-app) build on a gamma environment before it reaches production. It runs in shadow mode: it reports, and changes nothing about how main is merged or deployed.

## How it works

Every 4 hours, or on demand from the dashboard, a cycle:

1. Collects main's commits since the last green run (none means the cycle is skipped).
2. Moves postiz-app's `gamma` branch to main's newest commit, then waits for gamma's deploy run in GitHub Actions.
3. Checks the test channels, then runs the Playwright scenarios against gamma: the API and MCP answer, and real posts publish to test channels (text, image, scheduled) and are deleted afterwards where the platform allows.
4. Re-runs each failure once to confirm it, classifies it (code, infrastructure, external platform), and records the verdict.
5. On a confirmed red, emails the alert and halts. An admin resumes from the dashboard, with a reason that goes to the audit log.

Moving gamma, email and AI analysis stay dry-run until their credentials are set (`GAMMA_WRITES`, `SES_REGION`, `OPENAI_API_KEY`).

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js dashboard: runs, SLIs, test targets, audit log, admin commands, Google sign-in for postiz.com accounts |
| `apps/worker` | Temporal worker: the controller and cycle workflows and their activities |
| `scenarios` | Playwright scenarios and fixtures |
| `libs/core` | Shared code: auth, GitHub, deploy, email, AI and Postiz clients, platform cleanup |
| `libs/db` | Prisma schema and seed scripts |

## Local setup

Requirements: Node.js 22, pnpm, Docker, and a local [Postiz](https://github.com/gitroomhq/postiz-app) to test against.

1. Copy `.env.example` to `.env` and fill it in. Generate your own `JWT_SECRET` and `ENCRYPTION_KEY`. Leave `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` empty to use the dev login.
2. Start Postgres and Temporal: `pnpm dev:docker` (Postgres on 5442, Temporal on 7243, Temporal UI on http://localhost:8088).
3. Install and create the schema: `pnpm install`, then `pnpm prisma-db-push`.
4. Make yourself an admin: `pnpm seed:admin you@postiz.com`.
5. Run a local Postiz from its own worktree on main, with a test org whose channels are test accounts only (every run publishes real posts to them).
6. Seed the target: put that org's API key in `SEED_POSTIZ_API_KEY`, then `pnpm seed:target local http://localhost:3000 <integration id> ...` with the IDs of the channels to test.
7. Start the dashboard (`pnpm dev:web`, http://localhost:4300) and the worker (`pnpm dev:worker`).

On the dashboard's Test targets page, save platform credentials (for example a Telegram bot token) so cleanup can delete published posts on the platform itself.

## Running a cycle

- **Run now:** the dashboard's Run now button (admins, only while idle).
- **Force a red:** set `forceFail` on a scenario in the `Scenario` table. It fails before publishing anything. Unset it afterwards.
- **Resume after a red:** the dashboard's Resume button, with a reason.
- **List scenarios:** `pnpm scenarios:list`.

## Contributing

- Read `CLAUDE.md` for the house rules: pnpm only, Prisma only, follow postiz-app's patterns, integrations dry-run by default.
- Branch off `main` and open a PR into `main`.
- CodeRabbit doesn't review this repo automatically: comment `@coderabbitai review` on each PR.
- Never commit `.env` or credentials. Test credentials stay on the test targets page (encrypted) or in your local `.env`.
