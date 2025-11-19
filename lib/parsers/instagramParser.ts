import { requireInstagramConfig } from "@/lib/config/parserEndpoints";

interface ThirdPartyResponse {
  ok?: boolean;
  images?: Array<{ url: string; type?: string }>;
  videos?: Array<{ url: string; type?: string }>;
  message?: string;
}

const PARSER_TIMEOUT = 15000; // 15 seconds

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Parser request timeout");
    }
    throw error;
  }
}

export async function parseInstagramMedia(url: string): Promise<
  Array<{ url: string; type: "image" | "video" }>
> {
  const config = requireInstagramConfig();

  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    const response = await fetchWithTimeout(
      config.endpoint,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ url }),
      },
      PARSER_TIMEOUT
    );

    if (!response.ok) {
      throw new Error(`Parser service returned ${response.status}`);
    }

    const data: ThirdPartyResponse = await response.json();

    if (!data.ok || (!data.images && !data.videos)) {
      throw new Error(
        data.message || "Failed to parse media from Instagram post"
      );
    }

    const media: Array<{ url: string; type: "image" | "video" }> = [];

    if (data.images) {
      data.images.forEach((img) => {
        media.push({ url: img.url, type: "image" });
      });
    }

    if (data.videos) {
      data.videos.forEach((vid) => {
        media.push({ url: vid.url, type: "video" });
      });
    }

    if (media.length === 0) {
      throw new Error("No media found in Instagram post");
    }

    return media;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Instagram parser error: ${error.message}`);
    }
    throw new Error("Unknown error occurred while parsing Instagram media");
  }
}

