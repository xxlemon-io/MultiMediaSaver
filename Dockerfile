# ---- Base: Playwright runtime ----
    ARG PLAYWRIGHT_VERSION=1.56.1
    FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy AS base
    
    ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
    WORKDIR /app
    
    # ---- 1. 依赖安装阶段 (Dependencies) ----
    FROM base AS deps
    COPY package.json package-lock.json ./
    # 关键修改：这里使用 npm ci (安装所有依赖，包含 devDependencies)，
    # 这样 npm run build 才能正确读取 typescript 和 tsconfig.json
    RUN npm ci
    
    # ---- 2. 构建阶段 (Builder) ----
    FROM base AS builder
    WORKDIR /app
    COPY --from=deps /app/node_modules ./node_modules
    COPY . .
    
    # 此时 typescript 存在，路径别名 @/lib/... 可以被正确解析
    RUN npm run build
    
    # ---- 3. 运行阶段 (Runner) ----
    FROM base AS runner
    
    ENV NODE_ENV=production \
        PORT=3000 \
        PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
    
    WORKDIR /app
        
    # 复制 Next.js 的 Standalone 构建结果
    # 这一步会自动包含运行所需的最小 node_modules
    COPY --from=builder /app/.next/standalone ./
    COPY --from=builder /app/.next/static ./.next/static
    
    EXPOSE 3000
    CMD ["node", "server.js"]