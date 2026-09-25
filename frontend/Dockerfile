FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
# NEXT_PUBLIC_* values are inlined at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app /app
EXPOSE 3000
CMD ["pnpm", "start"]
