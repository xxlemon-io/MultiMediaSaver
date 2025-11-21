import { chromium } from "playwright";
import { MediaItem } from "./instagramPlaywright";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

// Convert xiaohongshu.com URL to xiaohongshu.day URL
function convertToDayUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // Replace domain
    if (urlObj.hostname.includes("xiaohongshu.com")) {
      urlObj.hostname = urlObj.hostname.replace(/www\.xiaohongshu\.com/g, "xiaohongshu.day");
      urlObj.hostname = urlObj.hostname.replace(/xiaohongshu\.com/g, "xiaohongshu.day");
    }
    
    // Convert discovery/item/ to explore/
    if (urlObj.pathname.startsWith("/discovery/item/")) {
      const noteId = urlObj.pathname.replace("/discovery/item/", "");
      urlObj.pathname = `/explore/${noteId}`;
    }
    
    // If path starts with /explore/, add /zh/ prefix
    if (urlObj.pathname.startsWith("/explore/")) {
      const noteId = urlObj.pathname.replace("/explore/", "");
      urlObj.pathname = `/zh/explore/${noteId}`;
    }
    
    return urlObj.toString();
  } catch (e) {
    // Fallback: simple string replacement
    let converted = url.replace(/www\.xiaohongshu\.com/g, "xiaohongshu.day");
    converted = converted.replace(/xiaohongshu\.com/g, "xiaohongshu.day");
    
    // Convert discovery/item/ to explore/
    converted = converted.replace(/\/discovery\/item\//g, "/explore/");
    
    const urlObj = new URL(converted);
    if (urlObj.pathname.startsWith("/explore/")) {
      const noteId = urlObj.pathname.replace("/explore/", "");
      return `https://xiaohongshu.day/zh/explore/${noteId}${urlObj.search}`;
    }
    
    return converted;
  }
}

// CDN safe download
async function download(context: any, url: string, isVideo: boolean = false): Promise<Buffer> {
  // For videos, use xiaohongshu.com as referer; for images, use xiaohongshu.day
  const referer = isVideo 
    ? "https://www.xiaohongshu.com/" 
    : "https://xiaohongshu.day/";
  
  const headers: Record<string, string> = {
    "User-Agent": UA,
    "Referer": referer,
    "Accept": isVideo ? "video/mp4,video/*;q=0.9,*/*;q=0.8" : "image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": isVideo ? "https://www.xiaohongshu.com" : "https://xiaohongshu.day",
    "Sec-Fetch-Dest": isVideo ? "video" : "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "cross-site",
  };

  const res = await context.request.get(url, { headers });
  
  if (!res.ok()) {
    // If 403, try with alternative headers
    if (res.status() === 403) {
      // Try with xiaohongshu.com referer for all media
      const altHeaders = {
        ...headers,
        "Referer": "https://www.xiaohongshu.com/",
        "Origin": "https://www.xiaohongshu.com",
      };
      const retryRes = await context.request.get(url, { headers: altHeaders });
      if (!retryRes.ok()) {
        throw new Error("Download failed: " + retryRes.status());
      }
      return Buffer.from(await retryRes.body());
    }
    throw new Error("Download failed: " + res.status());
  }
  return Buffer.from(await res.body());
}

export async function scrapeXiaohongshu(url: string): Promise<MediaItem[]> {
  const dayUrl = convertToDayUrl(url);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1920, height: 1080 },
  });

  try {
    const page = await context.newPage();
    await page.goto(dayUrl, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(3000); // Wait for content to load

    const mediaUrls: string[] = await page.evaluate(() => {
      const result: string[] = [];

      // Check if URL is a real media URL
      const isRealMedia = (url: string): boolean => {
        url = url.toLowerCase();

        // Must be from xiaohongshu CDN
        if (!url.includes("ci.xiaohongshu.com") && !url.includes("xhscdn.com")) {
          return false;
        }

        // Filter out small images (avatars, icons)
        const smallSizes = [
          "s34x34", "34x34",
          "s40x40", "40x40",
          "s64x64", "64x64",
          "s96x96", "96x96",
          "s150x150", "150x150",
          "s240x240", "240x240",
          "s320x320", "320x320",
          "s480x480", "480x480"
        ];
        for (const s of smallSizes) {
          if (url.includes(s)) return false;
        }

        // Filter out UI elements
        const badWords = ["sprite", "mask", "icon", "profile", "avatar", "badge", "fallback", "logo"];
        if (badWords.some((w) => url.includes(w))) return false;

        // Filter out non-media files
        if (url.endsWith(".png") && !url.includes("notes_pre_post")) return false;
        if (url.endsWith(".svg")) return false;

        return true;
      };

      // Extract from img tags
      document.querySelectorAll("img").forEach((img) => {
        if (img.src && isRealMedia(img.src)) {
          result.push(img.src);
        }
        if (img.srcset) {
          img.srcset.split(",").forEach((s) => {
            const u = s.trim().split(" ")[0];
            if (isRealMedia(u)) result.push(u);
          });
        }
      });

      // Extract from video tags
      document.querySelectorAll("video").forEach((v) => {
        if (v.src && isRealMedia(v.src)) {
          result.push(v.src);
        }
        const source = v.querySelector("source");
        if (source && source.src && isRealMedia(source.src)) {
          result.push(source.src);
        }
      });

      // Try to extract from data attributes
      document.querySelectorAll("[data-src]").forEach((el) => {
        const dataSrc = el.getAttribute("data-src");
        if (dataSrc && isRealMedia(dataSrc)) {
          result.push(dataSrc);
        }
      });

      return Array.from(new Set(result));
    });

    if (mediaUrls.length === 0) {
      throw new Error("No media found in Xiaohongshu post");
    }

    // Determine media type and create items
    const items: MediaItem[] = mediaUrls.map((u) => ({
      url: u,
      type: u.includes(".mp4") || u.includes("video") ? "video" : "image",
    }));

    // Download all media
    const itemsWithBuffers = await Promise.all(
      items.map(async (item) => ({
        ...item,
        buffer: await download(context, item.url, item.type === "video"),
      }))
    );

    return itemsWithBuffers as MediaItem[];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

