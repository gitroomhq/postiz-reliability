# syntax=docker/dockerfile:1.7
#
# The reliability app on ECS (Fargate, ARM64), following postiz-aws's
# docker/postiz-app.Dockerfile:
#
#   --target web      Next.js dashboard and API
#   --target worker   Temporal worker and the Playwright runner (API and MCP specs, no browsers)
#   --target migrate  Prisma CLI + schema.prisma, for the db push task
#
# Node and pnpm versions follow package.json (engines, packageManager).

ARG NODE_IMAGE=node:22.23.4-bookworm-slim

FROM ${NODE_IMAGE} AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/* \
 && npm --no-update-notifier --no-fund --global install pnpm@10.6.1
WORKDIR /app
# The postinstall runs `pnpm dlx prisma generate`, which needs the network
COPY . /app
RUN pnpm install --frozen-lockfile

FROM deps AS web
RUN pnpm run build:web
ENV NODE_ENV=production
WORKDIR /app/apps/web
CMD ["/app/node_modules/.bin/next", "start", "-p", "4300"]

# The runner resolves the repo root from apps/worker, and Playwright reads the
# specs and libs/core as TypeScript, so the whole tree stays in the image.
FROM deps AS worker
RUN pnpm run build:worker
ENV NODE_ENV=production
WORKDIR /app/apps/worker
CMD ["node", "./dist/apps/worker/src/main.js"]

FROM ${NODE_IMAGE} AS migrate
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/* \
 && npm --no-update-notifier --no-fund --global install prisma@6.5.0
WORKDIR /app
COPY libs/db/src/prisma/schema.prisma ./schema.prisma
CMD ["prisma", "db", "push", "--schema", "./schema.prisma", "--skip-generate"]
