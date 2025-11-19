import { chromium, Browser, Page, Response } from "playwright";

export interface ScrapedMediaItem {
  url: string;
  type: "image" | "video";
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function unique<T extends { url: string }>(items: T[]): T[] {
  const s = new Set<string>();
  return items.filter((i) => !s.has(i.url) && s.add(i.url));
}

// 目前只做最基础的“看起来是大图”的判断；你后面可自行再加更严格过滤
function isGoodImage(url: string): boolean {
  if (!url.includes("cdninstagram.com")) return false;

  // 可以先保留大部分，后续你在上层再过滤
  if (url.includes("sprite") || url.includes("placeholder") || url.includes("blur")) {
    return false;
  }

  return url.endsWith(".jpg") || url.includes(".jpg?");
}

export async function scrapeInstagramMediaWithPlaywright(
  postUrl: string
): Promise<ScrapedMediaItem[]> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox"],
    });

    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 720 },
    });

    const page: Page = await context.newPage();

    const images = new Set<string>();
    const videos = new Set<string>();

    const startTime = Date.now();
    const ACTIVE_WINDOW_MS = 8000; // 放宽时间窗口，尽可能抓全（你后面自己过滤）

    // 监听所有响应
    page.on("response", (res: Response) => {
      const now = Date.now();
      const elapsed = now - startTime;

      const url = res.url();

      // 如果你想完全不过滤时间，可以去掉这个判断
      if (elapsed > ACTIVE_WINDOW_MS) return;

      // 视频
      if (
        url.includes("cdninstagram.com") &&
        (url.endsWith(".mp4") || url.includes(".mp4?"))
      ) {
        videos.add(url);
        return;
      }

      // 图片
      if (isGoodImage(url)) {
        images.add(url);
      }
    });

    await page.goto(postUrl, {
      waitUntil: "networkidle",
      timeout: 45000,
    });

    // 尝试关掉弹窗
    await page.keyboard.press("Escape").catch(() => {});
    await page.mouse.click(10, 10).catch(() => {});

    // 等待一段时间让懒加载/轮播的资源请求都发出来
    await page.waitForTimeout(5000);

    const results: ScrapedMediaItem[] = [];

    images.forEach((u) => results.push({ url: u, type: "image" }));
    videos.forEach((u) => results.push({ url: u, type: "video" }));

    const final = unique(results);

    if (final.length === 0) {
      throw new Error("No media found.");
    }

    // 不再做 max 10 限制，全部交给上层处理
    return final;
  } finally {
    try {
      await browser?.close();
    } catch {}
  }
}