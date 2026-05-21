# Athena Web — multi-stage Dockerfile, Next.js 15 standalone output.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN pnpm install --frozen-lockfile || pnpm install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S athena && adduser -S athena -G athena
COPY --from=build --chown=athena:athena /app/.next/standalone ./
COPY --from=build --chown=athena:athena /app/.next/static ./.next/static
COPY --from=build --chown=athena:athena /app/public ./public
USER athena
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=2s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3000 || exit 1
CMD ["node", "server.js"]
