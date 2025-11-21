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

    // Collect video URLs from network requests (set up before navigation)
    const videoUrlsFromNetwork: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if ((url.includes('video.twimg.com') || url.includes('video.pscp.tv') || url.endsWith('.mp4')) && 
          !url.includes('thumbnail') && 
          !url.includes('preview')) {
        videoUrlsFromNetwork.push(url);
      }
    });

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

    // Wait for page to load with some random delay to simulate human behavior
    const baseWaitTime = 5000;
    const randomDelay = Math.random() * 2000; // 0-2 seconds random delay
    await page.waitForTimeout(baseWaitTime + randomDelay);

    // Check if page shows an error message (Twitter anti-bot protection)
    // Try checking multiple times as sometimes the error appears after initial load
    let hasError = false;
    for (let checkAttempt = 0; checkAttempt < 2; checkAttempt++) {
      hasError = await page.evaluate(() => {
        const bodyText = document.body.innerText || "";
        const title = document.title || "";
        return (
          bodyText.includes("Something went wrong") ||
          bodyText.includes("Try again") ||
          bodyText.includes("Something went wrong. Try reloading") ||
          bodyText.includes("Rate limit exceeded") ||
          title.includes("Something went wrong") ||
          document.querySelector('[data-testid="error"]') !== null ||
          document.querySelector('[data-testid="errorPage"]') !== null ||
          document.querySelector('div[role="alert"]') !== null
        );
      });
      
      if (hasError) break;
      
      // Wait a bit more before second check
      if (checkAttempt === 0) {
        await page.waitForTimeout(2000);
      }
    }

    if (hasError) {
      throw new Error(
        "Twitter returned an error page. This may be due to anti-bot protection. The tweet may be private, deleted, or Twitter is blocking automated access."
      );
    }

    // Check for videoPlayer element (indicates video tweet)
    const hasVideoPlayer = await page.evaluate(() => {
      return document.querySelector('[data-testid="videoPlayer"]') !== null;
    });

    if (hasVideoPlayer) {
      // Scroll to video player to trigger loading
      await page.evaluate(() => {
        const videoPlayer = document.querySelector('[data-testid="videoPlayer"]');
        if (videoPlayer) {
          videoPlayer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      await page.waitForTimeout(3000);
    }

    // Try to wait for video elements to load (they may be lazy-loaded)
    try {
      await page.waitForSelector("video, [data-testid='video']", { timeout: 10000 }).catch(() => {
        // Video might not be present or might load differently
      });
    } catch (e) {
      // Continue even if video selector doesn't appear
    }

    // Additional wait for dynamic content
    await page.waitForTimeout(2000);

    const media = await page.evaluate(() => {
      const items: Array<{ url: string; type: MediaType }> = [];

      const imageNodes = Array.from(
        document.querySelectorAll<HTMLImageElement>(
          'img[src*="pbs.twimg.com/media"], img[src*="pbs.twimg.com/ext_tw_video_thumb"]'
        )
      );

      imageNodes.forEach((img) => {
        if (img.src) {
          // Check if this is a video thumbnail
          if (img.src.includes("ext_tw_video_thumb")) {
            // This is a video thumbnail, try to find the actual video URL
            // Video thumbnails often have a corresponding video element nearby
            const parent = img.closest("article, div[data-testid='tweet']");
            if (parent) {
              const videoInParent = parent.querySelector("video");
              if (videoInParent && videoInParent.src) {
                items.push({ url: videoInParent.src, type: "video" });
              }
            }
            // Also keep the thumbnail as image for fallback
            items.push({ url: img.src, type: "image" });
          } else {
            // Regular image
            items.push({ url: img.src, type: "image" });
          }
        }
      });

      // Check for video elements with src attribute
      const videoElements = Array.from(document.querySelectorAll<HTMLVideoElement>("video"));
      videoElements.forEach((video) => {
        if (video.src) {
          items.push({ url: video.src, type: "video" });
        }
        // Also check currentSrc which might be different
        if (video.currentSrc && video.currentSrc !== video.src) {
          items.push({ url: video.currentSrc, type: "video" });
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

      // Check for video URLs in data attributes or other elements
      // Twitter sometimes embeds video URLs in data attributes
      const allElements = Array.from(document.querySelectorAll("*"));
      allElements.forEach((el) => {
        Array.from(el.attributes).forEach((attr) => {
          const value = attr.value;
          if (
            value &&
            typeof value === "string" &&
            (value.includes("video.twimg.com") || value.includes("video.pscp.tv"))
          ) {
            // Extract URL from attribute value
            const urlMatch = value.match(/https?:\/\/[^\s"']+/);
            if (urlMatch) {
              items.push({ url: urlMatch[0], type: "video" });
            }
          }
        });
      });

      return items;
    });

    clearTimeout(scrapeTimer);

    // Add video URLs found from network requests
    videoUrlsFromNetwork.forEach((url) => {
      media.push({ url, type: "video" });
    });

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

