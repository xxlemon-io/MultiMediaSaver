# ---- Base: Playwright runtime ----
    ARG PLAYWRIGHT_VERSION=1.56.1
    FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy AS base
    
    ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
    WORKDIR /app
    
    # ---- Dependencies (Install ALL deps for building) ----
    FROM base AS deps
    COPY package.json package-lock.json ./
    # 使用 npm ci 替代 npm install，更稳定且安装所有依赖(含 devDependencies)
    RUN npm ci
    
    # ---- Build App ----
    FROM base AS builder
    WORKDIR /app
    COPY --from=deps /app/node_modules ./node_modules
    COPY . .
    
    # 这一步现在可以成功，因为 devDependencies (typescript等) 已经安装
    RUN npm run build
    
    # ---- Runtime ----
    FROM base AS runner
    
    ENV NODE_ENV=production \
        PORT=3000 \
        PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
    
    WORKDIR /app
    
    # 创建非 root 用户更安全 (可选，但推荐)
    # RUN addgroup --system --gid 1001 nodejs
    # RUN adduser --system --uid 1001 nextjs
    # USER nextjs
    
    # 复制 public 文件夹
    COPY --from=builder /app/public ./public
    
    # 复制 standalone 输出 (包含必要的 node_modules 和 server.js)
    # 确保你的 next.config.js 中开启了 output: 'standalone'
    COPY --from=builder /app/.next/standalone ./
    # 复制静态资源
    COPY --from=builder /app/.next/static ./.next/static
    
    EXPOSE 3000
    CMD ["node", "server.js"]