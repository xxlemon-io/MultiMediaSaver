import { chromium, Browser, Page } from "playwright";

type MediaType = "image" | "video";

export interface ScrapedMediaItem {
  url: string;
  type: MediaType;
}

const NAVIGATION_TIMEOUT = 45_000;
const SCRAPE_TIMEOUT = 50_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function unique(items: ScrapedMediaItem[]): ScrapedMediaItem[] {
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.url) && seen.add(i.url));
}

export async function scrapeInstagramMediaWithPlaywright(
  postUrl: string
): Promise<ScrapedMediaItem[]> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 720 },
    });

    page = await context.newPage();

    //-----------------------------------------------------
    // 1. 捕获所有视频 URL（来自 network）
    //-----------------------------------------------------
    const videoUrlsFromNetwork: string[] = [];

    page.on("response", (response) => {
      const url = response.url();

      if (
        (url.includes("cdninstagram.com") || url.includes("fbcdn.net")) &&
        (url.endsWith(".mp4") || url.includes("/video/")) &&
        !url.includes("thumbnail") &&
        !url.includes("preview")
      ) {
        videoUrlsFromNetwork.push(url);
      }
    });

    //-----------------------------------------------------
    // 2. 打开页面
    //-----------------------------------------------------
    await page.goto(postUrl, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT,
    });

    await page.waitForTimeout(3000);

    //-----------------------------------------------------
    // 3. 处理登录弹窗（点击空白区域 + ESC）
    //-----------------------------------------------------
    try {
      const hasPopup = await page.evaluate(() => {
        const htmlDiv = document.querySelector('div[class*="html-div"]');
        const txt = document.body.innerText || "";
        return (
          !!htmlDiv ||
          (txt.includes("Login") &&
            (txt.includes("Sign up") || txt.includes("Log in")))
        );
      });

      if (hasPopup) {
        await page.mouse.click(20, 20);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(1000);
      }
    } catch {}

    //-----------------------------------------------------
    // 4. 检查是否 404
    //-----------------------------------------------------
    const notFound = await page.evaluate(() => {
      const txt = document.body.innerText || "";
      return (
        txt.includes("Sorry, this page isn't available") ||
        txt.includes("Page Not Found")
      );
    });
    if (notFound) {
      throw new Error("Post not found or unavailable.");
    }

    //-----------------------------------------------------
    // 5. 等待主内容
    //-----------------------------------------------------
    await page.waitForTimeout(2000);

    //-----------------------------------------------------
    // 6. 提取图片（最关键重构点）
    //    从 <ul><li aria-hidden="..."> 直接读取所有 slide
    //-----------------------------------------------------
    const imageUrls = await page.evaluate(() => {
      const urls = new Set<string>();

      // 抓取 carousel slides (最稳定，不需要点击 next)
      const liNodes = Array.from(
        document.querySelectorAll("ul li img[src], ul li img[data-src]")
      );

      for (const img of liNodes) {
        const src =
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src") ||
          img.getAttribute("src") ||
          "";

        if (!src) continue;

        // 过滤缩略图和头像
        if (
          src.includes("profile_pic") ||
          src.includes("150x150") ||
          src.includes("320x320")
        )
          continue;

        // 必须是 instagram CDN
        if (
          !src.includes("instagram") &&
          !src.includes("cdninstagram.com") &&
          !src.includes("fbcdn.net")
        )
          continue;

        urls.add(src);
      }

      //-----------------------------------------------------
      // 备用：从主容器抓取 img
      //-----------------------------------------------------
      const fallbackImgs = Array.from(document.querySelectorAll("img"));

      for (const img of fallbackImgs) {
        const src =
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src") ||
          img.src ||
          "";

        if (!src) continue;

        if (
          !src.includes("instagram") &&
          !src.includes("cdninstagram.com") &&
          !src.includes("fbcdn.net")
        )
          continue;

        // 过滤缩略图
        if (
          src.includes("150x150") ||
          src.includes("320x320") ||
          src.includes("profile_pic")
        )
          continue;

        urls.add(src);
      }

      return Array.from(urls);
    });

    //-----------------------------------------------------
    // 7. 提取视频（来自 DOM）
    //-----------------------------------------------------
    const videoUrlsFromDom = await page.evaluate(() => {
      const urls = new Set<string>();

      const vids = Array.from(document.querySelectorAll("video"));
      for (const v of vids) {
        if (v.src) urls.add(v.src);
        if (v.currentSrc) urls.add(v.currentSrc);
      }

      const sources = Array.from(
        document.querySelectorAll("video source[src]")
      );
      for (const s of sources) {
        const src = (s as HTMLSourceElement).src;
        if (src) {
          urls.add(src);
        }
      }

      return Array.from(urls);
    });

    //-----------------------------------------------------
    // 8. 组合所有媒体
    //-----------------------------------------------------
    const all: ScrapedMediaItem[] = [];

    imageUrls.forEach((u) => all.push({ url: u, type: "image" }));
    videoUrlsFromDom.forEach((u) => all.push({ url: u, type: "video" }));
    videoUrlsFromNetwork.forEach((u) => all.push({ url: u, type: "video" }));

    const result = unique(all);

    if (result.length === 0) {
      throw new Error("No media found.");
    }

    return result;
  } catch (err) {
    throw new Error(
      "Playwright scraping failed: " + (err instanceof Error ? err.message : err)
    );
  } finally {
    try {
      await page?.close();
    } catch {}
    try {
      await browser?.close();
    } catch {}
  }
}