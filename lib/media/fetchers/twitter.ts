import { MediaAsset, MediaProvider } from "@/lib/media/types";
import { scrapeTwitterMediaWithPlaywright } from "@/lib/parsers/twitterPlaywright";
import { saveMedia } from "@/lib/fs/saveMedia";
import { randomUUID } from "crypto";

const MAX_MEDIA_COUNT = 10;
const DOWNLOAD_TIMEOUT = 60000; // 60 seconds
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000; // 2 seconds

// Helper function to sleep with random jitter
function sleep(ms: number): Promise<void> {
  // Add random jitter (±20%) to avoid synchronized retries
  const jitter = ms * 0.2 * (Math.random() * 2 - 1);
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

// Retry function with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  initialDelay: number = INITIAL_RETRY_DELAY
): Promise<T> {
  let lastError: Error | unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if this is a retryable error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isRetryable = 
        errorMessage.includes("anti-bot protection") ||
        errorMessage.includes("error page") ||
        errorMessage.includes("Something went wrong") ||
        errorMessage.includes("Try again") ||
        errorMessage.includes("blocking automated access");
      
      // Don't retry if it's not a retryable error or we've exhausted retries
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = initialDelay * Math.pow(2, attempt);
      console.log(`[Twitter] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

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
        'Referer': 'https://x.com/',
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

export const twitterProvider: MediaProvider = {
  canHandle(url: string): boolean {
    const normalizedUrl = url.toLowerCase().trim();
    return (
      normalizedUrl.includes("twitter.com") ||
      normalizedUrl.includes("x.com")
    );
  },

  async fetchMedia(url: string, sessionId: string): Promise<MediaAsset[]> {
    // Retry scraping with exponential backoff for transient errors
    const mediaList = await retryWithBackoff(() => 
      scrapeTwitterMediaWithPlaywright(url)
    );

    if (mediaList.length > MAX_MEDIA_COUNT) {
      throw new Error(
        `Too many media files (max ${MAX_MEDIA_COUNT}). Found ${mediaList.length}`
      );
    }

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
            media.url,
            sessionId
          );

          return {
            id: randomUUID(),
            sourceUrl: media.url,
            downloadUrl: publicPath,
            contentType,
            filename,
            provider: "twitter",
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

