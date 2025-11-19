import { MediaAsset, MediaProvider } from "@/lib/media/types";
import { scrapeInstagram } from "@/lib/parsers/instagramPlaywright";
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
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Referer': 'https://www.instagram.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
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

export const instagramProvider: MediaProvider = {
  canHandle(url: string): boolean {
    const normalizedUrl = url.toLowerCase().trim();
    return normalizedUrl.includes("instagram.com");
  },

  async fetchMedia(url: string): Promise<MediaAsset[]> {
    const mediaList = await scrapeInstagram(url);

    const assets: MediaAsset[] = await Promise.all(
      mediaList.map(async (media) => {
        try {
          const { buffer, contentType } = await downloadMedia(
            media.url,
            media.type
          );

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
            provider: "instagram",
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

