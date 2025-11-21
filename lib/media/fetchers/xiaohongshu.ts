import { MediaAsset, MediaProvider } from "@/lib/media/types";
import { scrapeXiaohongshu } from "@/lib/parsers/xiaohongshuPlaywright";
import { saveMedia } from "@/lib/fs/saveMedia";
import { randomUUID } from "crypto";

const DOWNLOAD_TIMEOUT = 60000; // 60 seconds

async function downloadMedia(
  url: string,
  type: "image" | "video"
): Promise<{ buffer: Buffer; contentType: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

  try {
    // For videos, use xiaohongshu.com as referer; for images, use xiaohongshu.day
    const referer = type === "video" 
      ? "https://www.xiaohongshu.com/" 
      : "https://xiaohongshu.day/";

    const headers: HeadersInit = {
      'Referer': referer,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': type === "video" ? "video/mp4,video/*;q=0.9,*/*;q=0.8" : "image/webp,image/apng,image/*,*/*;q=0.8",
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
      'Origin': type === "video" ? "https://www.xiaohongshu.com" : "https://xiaohongshu.day",
    };

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // If 403, try with alternative referer
      if (response.status === 403) {
        const retryHeaders = {
          ...headers,
          'Referer': 'https://www.xiaohongshu.com/',
          'Origin': 'https://www.xiaohongshu.com',
        };
        const retryResponse = await fetch(url, {
          signal: controller.signal,
          headers: retryHeaders,
        });
        if (!retryResponse.ok) {
          throw new Error(`Failed to download media: ${retryResponse.status}`);
        }
        const contentType =
          retryResponse.headers.get("content-type") ||
          (type === "image" ? "image/jpeg" : "video/mp4");
        const arrayBuffer = await retryResponse.arrayBuffer();
        return {
          buffer: Buffer.from(arrayBuffer),
          contentType,
        };
      }
      throw new Error(`Failed to download media: ${response.status}`);
    }

    const contentType =
      response.headers.get("content-type") ||
      (type === "image" ? "image/jpeg" : "video/mp4");

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Download timeout");
    }
    throw error;
  }
}

export const xiaohongshuProvider: MediaProvider = {
  canHandle(url: string): boolean {
    const normalizedUrl = url.toLowerCase().trim();
    return normalizedUrl.includes("xiaohongshu.com");
  },

  async fetchMedia(url: string): Promise<MediaAsset[]> {
    const mediaList = await scrapeXiaohongshu(url);

    const assets: MediaAsset[] = await Promise.all(
      mediaList.map(async (media) => {
        try {
          // Use buffer from scraper if available, otherwise download
          let buffer: Buffer;
          let contentType: string;

          if (media.buffer) {
            buffer = media.buffer;
            contentType = media.type === "image" ? "image/jpeg" : "video/mp4";
          } else {
            const downloaded = await downloadMedia(media.url, media.type);
            buffer = downloaded.buffer;
            contentType = downloaded.contentType;
          }

          const { publicPath, filename } = await saveMedia(
            buffer,
            contentType,
            media.url
          );

          return {
            id: randomUUID(),
            sourceUrl: media.url,
            downloadUrl: publicPath,
            contentType,
            filename,
            provider: "xiaohongshu",
            type: media.type,
          };
        } catch (error) {
          throw new Error(
            `Failed to download ${media.type}: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      })
    );

    return assets;
  },
};

