FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
# Every package.json the worker's dependency graph reaches must be present before
# `pnpm install`, or pnpm won't recognize it as a workspace project and its own
# dependencies (prisma's CLI, most notably) silently never get installed. Keep this
# list in sync with apps/worker's "workspace:*" dependencies.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/engine/package.json packages/engine/
COPY packages/channels/package.json packages/channels/
COPY packages/ai/package.json packages/ai/
COPY packages/analytics/package.json packages/analytics/
COPY packages/storage/package.json packages/storage/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile || pnpm install
COPY packages ./packages
COPY apps/worker ./apps/worker
# `...` selects the package plus every workspace package it depends on, built in
# dependency order in one pass — including packages/db's own build script, which
# already runs `prisma generate` before its `tsc`. No hand-maintained build order to
# keep in sync as new workspace packages are added.
RUN pnpm --filter @digisoft/worker... build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
WORKDIR /app/apps/worker
CMD ["node", "dist/main.js"]
