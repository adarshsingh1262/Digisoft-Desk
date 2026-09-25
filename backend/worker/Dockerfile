FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
# Every package.json the worker's dependency graph reaches must be present before
# `pnpm install`, or pnpm won't recognize it as a workspace project and its own
# dependencies (prisma's CLI, most notably) silently never get installed. Keep this
# list in sync with backend/worker's "workspace:*" dependencies.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY backend/packages/tsconfig/package.json backend/packages/tsconfig/
COPY backend/packages/shared/package.json backend/packages/shared/
COPY backend/packages/db/package.json backend/packages/db/
COPY backend/packages/engine/package.json backend/packages/engine/
COPY backend/packages/channels/package.json backend/packages/channels/
COPY backend/packages/ai/package.json backend/packages/ai/
COPY backend/packages/analytics/package.json backend/packages/analytics/
COPY backend/packages/storage/package.json backend/packages/storage/
COPY backend/worker/package.json backend/worker/
RUN pnpm install --frozen-lockfile || pnpm install
COPY backend/packages ./backend/packages
COPY backend/worker ./backend/worker
# `...` selects the package plus every workspace package it depends on, built in
# dependency order in one pass — including backend/packages/db's own build script, which
# already runs `prisma generate` before its `tsc`. No hand-maintained build order to
# keep in sync as new workspace packages are added.
RUN pnpm --filter @digisoft/worker... build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
WORKDIR /app/backend/worker
CMD ["node", "dist/main.js"]
