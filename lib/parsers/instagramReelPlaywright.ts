import { chromium } from "playwright";
import { MediaItem } from "./instagramPlaywright";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

function extractShortcode(url: string): string {
  const m = url.match(/\/(reel|p)\/([^\/]+)/);
  if (!m) throw new Error("Invalid Instagram URL");
  return m[2];
}

export async function scrapeInstagramReel(url: string): Promise<MediaItem[]> {
  const shortcode = extractShortcode(url);

  // embed URL works even when main site & API are blocked
  const embedURL = `https://www.instagram.com/reel/${shortcode}/embed/`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 414, height: 896 },
  });

  try {
    const page = await context.newPage();
    await page.goto(embedURL, { waitUntil: "networkidle", timeout: 45000 });

    await page.waitForTimeout(2000);

    // Extract video URL from the embed HTML
    const videoUrl: string | null = await page.evaluate(() => {
      // 1. Try <video> tag
      const v = document.querySelector("video");
      if (v && (v as HTMLVideoElement).src.includes("mp4")) {
        return (v as HTMLVideoElement).src;
      }

      // 2. Try <source> tag
      const s = document.querySelector("source");
      if (s && (s as HTMLSourceElement).src.includes("mp4")) {
        return (s as HTMLSourceElement).src;
      }

      // 3. Try parse JSON inside embed
      const scripts = [...document.querySelectorAll("script")] as HTMLScriptElement[];
      for (const script of scripts) {
        const text = script.textContent || "";
        const m = text.match(/"video_url":"(https:[^"]+mp4[^"]*)"/);
        if (m) return m[1].replace(/\\u0026/g, "&");
      }

      return null;
    });

    if (!videoUrl) {
      throw new Error("No video URL found in Reel embed page");
    }

    // Download video to buffer
    const res = await context.request.get(videoUrl, {
      headers: {
        "User-Agent": UA,
        Referer: embedURL,
      },
    });

    const buffer = Buffer.from(await res.body());

    return [
      {
        url: videoUrl,
        type: "video",
        buffer,
      },
    ];
  } finally {
    await browser.close();
  }
}