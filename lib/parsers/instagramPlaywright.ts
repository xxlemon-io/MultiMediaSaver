import { chromium } from "playwright";

export interface MediaItem {
  url: string;
  type: "image" | "video";
  buffer?: Buffer;
}

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// CDN 403 safe download
async function download(context: any, url: string): Promise<Buffer> {
  const res = await context.request.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: "https://www.instagram.com/",
      Accept: "*/*",
    },
  });
  if (!res.ok()) throw new Error("Download failed: " + res.status());
  return Buffer.from(await res.body());
}

export async function scrapeInstagram(url: string): Promise<MediaItem[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 414, height: 896 },
    isMobile: true,
    deviceScaleFactor: 3,
  });

  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    const collected = new Set<string>();

    async function extractNow() {
      const urls: string[] = await page.evaluate(() => {
        const result: string[] = [];
    
        // 检查是否是 IG 真实媒体（过滤所有 icon/头像/UI）
        const isRealMedia = (url: string, el?: HTMLElement): boolean => {
          url = url.toLowerCase();
    
          if (!url.includes("cdninstagram")) return false;
    
          // 过滤头像 / UI icon 小图
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
    
          // 过滤文件名明显是 UI 图标
          const badWords = ["sprite", "mask", "icon", "profile", "avatar", "badge", "fallback"];
          if (badWords.some((w) => url.includes(w))) return false;
    
          // 过滤 png/svg
          if (url.endsWith(".png") || url.endsWith(".svg")) return false;
    
          // 必须属于 carousel 区域
          if (el) {
            const article = el.closest("article");
            if (!article) return false;
    
            const pres = article.querySelector("div[role='presentation']");
            if (!pres) return false;
            if (!pres.contains(el)) return false; // 不在 carousel 主体区
          }
    
          return true;
        };
    
        document.querySelectorAll("img").forEach((img) => {
          if (isRealMedia(img.src, img)) result.push(img.src);
    
          if (img.srcset) {
            img.srcset.split(",").forEach((s) => {
              const u = s.trim().split(" ")[0];
              if (isRealMedia(u, img)) result.push(u);
            });
          }
        });
    
        document.querySelectorAll("video").forEach((v) => {
          if (isRealMedia(v.src, v)) result.push(v.src);
          const s = v.querySelector("source");
          if (s && isRealMedia(s.src, v)) result.push(s.src);
        });
    
        return Array.from(new Set(result));
      });
    
      urls.forEach((u) => collected.add(u));
    }

    // 1. 抓取当前可见的
    await extractNow();

    // 2. 循环模拟手机滑动
    const swipeJS = `
    (() => {
      const layer = document.querySelector("article div[role='presentation']");
      if (!layer) return false;
    
      const rect = layer.getBoundingClientRect();
    
      const startX = rect.right - rect.width * 0.15;
      const startY = rect.top + rect.height * 0.5;
      const endX   = rect.left + rect.width * 0.15;
    
      const mkTouch = (x, y) =>
        new Touch({
          identifier: Date.now(),
          target: layer,
          clientX: x,
          clientY: y,
          radiusX: 2,
          radiusY: 2,
          rotationAngle: 0,
          force: 1,
        });
    
      // touchstart
      layer.dispatchEvent(new TouchEvent("touchstart", {
        touches: [mkTouch(startX, startY)],
        bubbles: true,
        cancelable: true,
      }));
    
      // touchmove (midpoint)
      layer.dispatchEvent(new TouchEvent("touchmove", {
        touches: [mkTouch((startX + endX)/2, startY)],
        bubbles: true,
        cancelable: true,
      }));
    
      // touchend
      layer.dispatchEvent(new TouchEvent("touchend", {
        changedTouches: [mkTouch(endX, startY)],
        bubbles: true,
        cancelable: true,
      }));
    
      return true;
    })();
    `;

    for (let i = 0; i < 6; i++) {
      await page.evaluate(swipeJS);
      await page.waitForTimeout(1200);
      await extractNow();
    }

    if (collected.size === 0)
      throw new Error("No media found even after swipe.");

    const items = [...collected].map((u) => ({
      url: u,
      type: u.includes(".mp4") ? "video" : "image",
    }));

    // 3. 下载所有媒体（避开 403）
    // 使用 Promise.all 并显式扩展每个 item 类型，确保包含 buffer 属性
    const itemsWithBuffers = await Promise.all(
      items.map(async (item) => ({
        ...item,
        buffer: await download(context, item.url),
      }))
    );
    // 用 itemsWithBuffers 替代原 items
    items.splice(0, items.length, ...itemsWithBuffers);
    // Also, ensure correct typing for returned value

    return items as MediaItem[];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}