ARG PLAYWRIGHT_VERSION=1.56.1

# Base with browsers installed
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy AS base
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# -----------------------------
# Dependencies with cache layer
# -----------------------------
FROM base AS deps
WORKDIR /app

COPY package*.json ./
# Cached if package.json unchanged
RUN npm ci --omit=dev

# -----------------------------
# Builder
# -----------------------------
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Allow Next.js incremental build to cache
ENV NODE_ENV=production
RUN npm run build

# -----------------------------
# Runner (smallest possible)
# -----------------------------
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Copy only the built standalone server
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create downloads directory
RUN mkdir -p /app/public/downloads \
    && chown -R nextjs:nodejs /app/public/downloads

USER nextjs

EXPOSE 3000
CMD ["node", "server.js"]