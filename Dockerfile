# ---- Base: Playwright runtime ----
    ARG PLAYWRIGHT_VERSION=1.56.1
    FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy AS base
    
    ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
    WORKDIR /app
    
    # ---- Install dependencies ----
    COPY package.json package-lock.json ./
    RUN npm install --production
    
    # ---- Build App ----
    COPY . .
    RUN npm run build
    
    # ---- Runtime ----
    FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy AS runner
    
    ENV NODE_ENV=production \
        PORT=3000 \
        PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
    
    WORKDIR /app
    
    COPY --from=base /app/node_modules ./node_modules
    COPY --from=base /app/public ./public
    COPY --from=base /app/.next/standalone ./
    COPY --from=base /app/.next/static ./.next/static
    
    EXPOSE 3000
    CMD ["node", "server.js"]