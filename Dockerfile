# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# base: the toolchain every stage shares
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: installed dependencies, cached independently of the source
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/adapters/package.json packages/adapters/package.json
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build: the production Next.js build
# ---------------------------------------------------------------------------
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @moneytracker/web build

# ---------------------------------------------------------------------------
# migrate: applies database migrations, then exits
# ---------------------------------------------------------------------------
FROM deps AS migrate
COPY . .
CMD ["pnpm", "db:migrate"]

# ---------------------------------------------------------------------------
# runner: the app, as a non-root user with a read-only filesystem
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# A dedicated unprivileged user, as required by rules/security.md.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1

CMD ["node", "apps/web/server.js"]
