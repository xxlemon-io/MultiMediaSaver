import { chromium, Response } from "playwright";
import { MediaItem } from "./instagramPlaywright";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

function extractShortcode(url: string): string {
  const m = url.match(/\/(reel|p)\/([^\/\?]+)/);
  if (!m) throw new Error("Invalid Instagram URL");
  return m[2];
}

// Clean URL (remove range params)
function cleanVideoUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("bytestart");
    u.searchParams.delete("byteend");
    u.searchParams.delete("range");
    return u.toString();
  } catch {
    return url.replace(/bytestart=\d+/g, "").replace(/byteend=\d+/g, "");
  }
}

// Detect Range request
function isRangeRequest(url: string): boolean {
  return url.includes("bytestart=") || url.includes("byteend=") || url.includes("range=");
}

// Detect audio-only
function isAudioOnly(url: string, meta?: any): boolean {
  const lower = url.toLowerCase();
  if (lower.includes("audio") && !lower.includes("video")) return true;
  if (meta?.contentType?.includes("audio")) return true;

  try {
    const u = new URL(url);
    const efg = u.searchParams.get("efg");
    if (efg) {
      const decoded = decodeURIComponent(efg);
      const parsed = JSON.parse(decoded);
      const tag = parsed?.vencode_tag || "";
      if (tag.includes("audio") && !tag.includes("video")) return true;
    }
  } catch {}
  return false;
}

// Detect video-track only (strict check)
function isVideoStream(url: string, meta?: any): boolean {
  const lower = url.toLowerCase();
  
  // Explicitly exclude audio
  if (lower.includes("audio") && !lower.includes("video")) return false;
  
  // Must have video indicators
  if (!lower.includes(".mp4") && !lower.includes("video") && !lower.includes("/o1/v/")) return false;
  
  // Check content-type first (most reliable)
  if (meta?.contentType) {
    const ct = meta.contentType.toLowerCase();
    if (ct.includes("video") && !ct.includes("audio")) return true;
    if (ct.includes("audio") && !ct.includes("video")) return false;
  }

  // Check efg parameter for encoding tags
  try {
    const u = new URL(url);
    const efg = u.searchParams.get("efg");
    if (efg) {
      const decoded = decodeURIComponent(efg);
      const parsed = JSON.parse(decoded);
      const tag = parsed?.vencode_tag || "";
      // Video streams should have video/clip in tag
      if (tag.includes("video") || tag.includes("clip")) return true;
      // If tag explicitly says audio-only, exclude it
      if (tag.includes("audio") && !tag.includes("video") && !tag.includes("clip")) return false;
    }
  } catch {}

  // Default: if it has .mp4 and doesn't have "audio" keyword, assume video
  // But be cautious - this might still match audio-only mp4s
  return lower.includes(".mp4") && !lower.includes("audio");
}

// Downloder
async function download(context: any, url: string, ref: string): Promise<Buffer> {
  const clean = cleanVideoUrl(url);
  const res = await context.request.get(clean, {
    headers: {
      "User-Agent": UA,
      Referer: ref,
      Accept: "*/*"
    }
  });
  if (!res.ok()) throw new Error("Download failed: " + res.status());
  return Buffer.from(await res.body());
}

/* ==========================================================
   1) EMBED PARSER
========================================================== */
async function tryEmbed(context: any, shortcode: string): Promise<string | null> {
  const embedURL = `https://www.instagram.com/reel/${shortcode}/embed/`;
  const page = await context.newPage();

  try {
    await page.goto(embedURL, { waitUntil: "load", timeout: 45000 });
    await page.waitForTimeout(1500);

    // direct <video>
    const v = await page.evaluate(() => {
      const vid = document.querySelector("video") as HTMLVideoElement | null;
      return vid?.src && vid.src.includes("mp4") ? vid.src : null;
    });
    if (v) return cleanVideoUrl(v);

    // script video_url
    const scriptVideo = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script"));
      for (const sc of scripts) {
        const text = sc.textContent || "";
        const m = text.match(/"video_url"\s*:\s*"([^"]+mp4[^"]*)"/);
        if (m) return m[1].replace(/\\u0026/g, "&");
      }
      return null;
    });
    if (scriptVideo) return cleanVideoUrl(scriptVideo);

    return null;
  } finally {
    await page.close();
  }
}

/* ==========================================================
   2) GRAPHQL PARSER
========================================================== */
async function tryGraphQL(context: any, reelURL: string): Promise<string | null> {
  const page = await context.newPage();
  const candidates = new Set<string>();
  const meta = new Map<string, any>();

  // capture GraphQL responses
  page.on("response", async (res: Response) => {
    const url = res.url();
    if (!url.includes("/api/graphql")) return;

    try {
      const json = await res.json();
      const media =
        json?.data?.xdt_shortcode_media ||
        json?.data?.shortcode_media ||
        null;

      if (media?.video_url) candidates.add(media.video_url);
      if (media?.video_versions) {
        for (const v of media.video_versions) {
          if (v.url) candidates.add(v.url);
        }
      }
    } catch {}
  });

  // capture CDN requests (to get metadata early)
  page.on("request", (req: any) => {
    const url = req.url();
    if (url.includes("cdninstagram") && (url.includes(".mp4") || url.includes("/video/") || url.includes("/o1/"))) {
      candidates.add(url);
    }
  });

  // capture CDN responses (to get content-type)
  page.on("response", async (res: Response) => {
    const url = res.url();
    if (!url.includes("cdninstagram")) return;

    const contentType = res.headers()["content-type"] || "";
    meta.set(url, { contentType });
    
    // Also store for cleaned URL (without range params)
    if (isRangeRequest(url)) {
      const cleaned = cleanVideoUrl(url);
      meta.set(cleaned, { contentType });
    }
  });

  try {
    await page.goto(reelURL, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(2500);
    await page.click("body").catch(() => {});
    await page.waitForTimeout(2000);
  } catch {}

  await page.waitForTimeout(2500);
  await page.close();

  // Classify: exclude audio, prioritize video
  const allCandidates = Array.from(candidates);
  const nonAudio = allCandidates.filter(url => !isAudioOnly(url, meta.get(url)));
  const videoStreams = nonAudio.filter(url => isVideoStream(url, meta.get(url)));
  
  // Smart selection: prefer URLs with "t2" pattern over "t16" (t16 might be audio)
  // Also prefer URLs without range params
  let selected: string | null = null;
  
  if (videoStreams.length > 0) {
    const fullVideoUrls = videoStreams.filter(url => !isRangeRequest(url));
    
    if (fullVideoUrls.length > 0) {
      const t2Urls = fullVideoUrls.filter(url => url.includes('/t2/'));
      if (t2Urls.length > 0) {
        selected = t2Urls[0];
      } else {
        const nonT16Urls = fullVideoUrls.filter(url => !url.includes('/t16/'));
        selected = nonT16Urls.length > 0 ? nonT16Urls[0] : fullVideoUrls[0];
      }
    } else {
      const t2Urls = videoStreams.filter(url => url.includes('/t2/'));
      if (t2Urls.length > 0) {
        selected = t2Urls[0];
      } else {
        const nonT16Urls = videoStreams.filter(url => !url.includes('/t16/'));
        selected = nonT16Urls.length > 0 ? nonT16Urls[0] : videoStreams[0];
      }
    }
    
    return cleanVideoUrl(selected);
  }
  
  if (nonAudio.length > 0) {
    return cleanVideoUrl(nonAudio[0]);
  }
  
  if (allCandidates.length > 0) {
    console.warn("[GraphQL] Warning: No video stream found, using first candidate (may be audio-only)");
    return cleanVideoUrl(allCandidates[0]);
  }

  return null;
}

/* ==========================================================
   3) AMP JSON PARSER
========================================================== */
async function tryAMP(context: any, shortcode: string): Promise<string | null> {
  const api = `https://www.instagram.com/reel/${shortcode}/?__a=1&__d=dis`;
  const page = await context.newPage();

  try {
    const resp = await page.goto(api, { waitUntil: "load", timeout: 45000 });
    if (!resp || resp.status() >= 400) return null;

    const raw = await page.evaluate(() => document.body.innerText);
    if (!raw || raw.startsWith("<")) return null;

    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      return null;
    }

    const media =
      json?.items?.[0] ||
      json?.graphql?.shortcode_media ||
      json?.data?.xdt_shortcode_media ||
      null;

    if (!media) return null;

    if (media.video_url) return cleanVideoUrl(media.video_url);

    if (media.video_versions?.length) {
      const sorted = media.video_versions.sort((a: any, b: any) => b.width - a.width);
      return cleanVideoUrl(sorted[0].url);
    }

    return null;
  } finally {
    await page.close();
  }
}

/* ==========================================================
   MASTER FUNCTION
========================================================== */
export async function scrapeInstagramReel(url: string): Promise<MediaItem[]> {
  const shortcode = extractShortcode(url);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: UA });

  try {
    // 1) EMBED
    const e = await tryEmbed(context, shortcode);
    if (e) {
      console.log("[Reels] embed success");
      const buffer = await download(context, e, url);
      return [{ url: e, type: "video", buffer }];
    }

    // 2) GRAPHQL
    const g = await tryGraphQL(context, url);
    if (g) {
      console.log("[Reels] GraphQL success");
      const buffer = await download(context, g, url);
      return [{ url: g, type: "video", buffer }];
    }

    // 3) AMP JSON
    const a = await tryAMP(context, shortcode);
    if (a) {
      console.log("[Reels] AMP success");
      const buffer = await download(context, a, url);
      return [{ url: a, type: "video", buffer }];
    }

    throw new Error("All fallback methods failed (embed, graphql, amp)");
  } finally {
    await browser.close();
  }
}