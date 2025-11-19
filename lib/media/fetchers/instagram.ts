import { MediaProvider } from "@/lib/media/types";

export const instagramProvider: MediaProvider = {
  canHandle(url: string): boolean {
    const normalizedUrl = url.toLowerCase().trim();
    return normalizedUrl.includes("instagram.com");
  },

  async fetchMedia(url: string): Promise<never> {
    throw new Error("Instagram support is coming soon");
  },
};

