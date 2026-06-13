# Athena Web - multi-stage Dockerfile, Next.js 15 standalone output.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ------------------------------------------------------------------ #
# dev - bind-mounted hot-reload target for local docker-compose.      #
# Carries ONLY the installed node_modules (from `deps`) + pnpm; the    #
# source tree is bind-mounted over /app at runtime (compose            #
# `frontend.volumes`), with an anonymous volume preserving THIS        #
# stage's /app/node_modules. Runs `next dev`, so NEXT_PUBLIC_* are     #
# read at RUNTIME (not inlined) and a source edit reflects live with   #
# NO image rebuild. `next dev` (not `--turbo`) so the webpack watcher  #
# honours WATCHPACK_POLLING/CHOKIDAR_USEPOLLING - required because     #
# host→container bind mounts don't deliver inotify events on           #
# Windows/WSL.                                                         #
# ------------------------------------------------------------------ #
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 3000
# `-H 0.0.0.0` so the dev server is reachable via the host port map.
CMD ["pnpm", "exec", "next", "dev", "-H", "0.0.0.0", "-p", "3000"]

FROM base AS build
# NEXT_PUBLIC_* are inlined into the client bundle at `pnpm build` time -
# they must be present as ENV here, not just at container runtime.
# docker-compose passes them via `frontend.build.args`.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ARG NEXT_PUBLIC_API_MODE=live
ARG NEXT_PUBLIC_APP_NAME=Athena
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_MODE=$NEXT_PUBLIC_API_MODE
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
# Next.js standalone reads HOSTNAME at boot; without this it binds to a
# single container-interface IP and the in-container ``wget 127.0.0.1``
# healthcheck below would fail with "Connection refused" forever.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
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
