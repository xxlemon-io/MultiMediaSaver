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

function uniqueMedia(items: ScrapedMediaItem[]): ScrapedMediaItem[] {
  const seen = new Set<string>();
  const result: ScrapedMediaItem[] = [];

  for (const item of items) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    result.push(item);
  }

  return result;
}

function normalizeImageUrl(url: string): string {
  // If already has :orig, keep it
  if (url.includes(":orig")) return url;
  
  // If URL has query parameters, try to upgrade to higher quality
  // Original URLs like: https://pbs.twimg.com/media/XXX?format=jpg&name=small
  // Try to change to: https://pbs.twimg.com/media/XXX?format=jpg&name=large
  if (url.includes("?")) {
    // Replace name parameter with large if it exists
    if (url.includes("name=")) {
      return url.replace(/name=[^&]+/, "name=large");
    }
    // If no name parameter, add it
    return `${url}&name=large`;
  }
  
  // If URL has :suffix format (like :small, :medium), remove it and add query param
  // Handle URLs like: https://pbs.twimg.com/media/XXX:small
  let baseUrl = url;
  if (baseUrl.match(/:\w+$/)) {
    baseUrl = baseUrl.replace(/:\w+$/, "");
    return `${baseUrl}?name=large`;
  }
  
  // If no modifications needed, return original
  return url;
}

export async function scrapeTwitterMediaWithPlaywright(
  tweetUrl: string
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

    const controller = new AbortController();
    const scrapeTimer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT);

    try {
      await page.goto(tweetUrl, {
        waitUntil: "domcontentloaded", // Changed from networkidle to avoid timeouts
        timeout: NAVIGATION_TIMEOUT,
      });
      
      // Wait for key elements that indicate content is loaded
      try {
        await page.waitForSelector("article", { timeout: 10000 });
      } catch (e) {
        // If article doesn't load, might be an error page, but we'll proceed to check for media anyway
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("net::ERR_NAME_NOT_RESOLVED")) {
        throw new Error("Unable to reach Twitter. Check network connectivity.");
      }
      throw error;
    }

    await page.waitForTimeout(5000);

    const media = await page.evaluate(() => {
      const items: Array<{ url: string; type: MediaType }> = [];

      const imageNodes = Array.from(
        document.querySelectorAll<HTMLImageElement>(
          'img[src*="pbs.twimg.com/media"], img[src*="pbs.twimg.com/ext_tw_video_thumb"]'
        )
      );

      imageNodes.forEach((img) => {
        if (img.src) {
          items.push({ url: img.src, type: "image" });
        }
      });

      const videoSources = Array.from(
        document.querySelectorAll<HTMLSourceElement>("video source[src]")
      );

      videoSources.forEach((source) => {
        if (source.src) {
          items.push({ url: source.src, type: "video" });
        }
      });

      const videoLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href*="video.twimg.com"]')
      );

      videoLinks.forEach((link) => {
        if (link.href) {
          items.push({ url: link.href, type: "video" });
        }
      });

      return items;
    });

    clearTimeout(scrapeTimer);

    const normalized = media.map((item) => {
      if (item.type === "image") {
        return { ...item, url: normalizeImageUrl(item.url) };
      }
      return item;
    });

    const unique = uniqueMedia(normalized);

    if (unique.length === 0) {
      throw new Error(
        "No media found via Playwright scraping. Tweet may be private or media could be dynamically loaded."
      );
    }

    return unique;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Target page, context or browser has been closed")) {
      throw new Error("Playwright browser was closed unexpectedly. Ensure the environment allows headless browsers.");
    }
    throw new Error(
      `Playwright scraping failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  } finally {
    if (page) {
      await page.close().catch(() => undefined);
    }
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

