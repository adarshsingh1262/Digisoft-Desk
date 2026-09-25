FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY backend/packages/tsconfig/package.json backend/packages/tsconfig/
COPY backend/packages/shared/package.json backend/packages/shared/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile || pnpm install
COPY backend/packages ./backend/packages
COPY frontend ./frontend
RUN pnpm --filter @digisoft/shared build && pnpm --filter @digisoft/web build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app /app
WORKDIR /app/frontend
EXPOSE 3000
CMD ["pnpm", "start"]
