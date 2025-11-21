export type ProviderType = "twitter" | "instagram" | "xiaohongshu" | "unknown";

export function detectProvider(url: string): ProviderType {
  const normalizedUrl = url.toLowerCase().trim();

  if (
    normalizedUrl.includes("twitter.com") ||
    normalizedUrl.includes("x.com")
  ) {
    return "twitter";
  }

  if (normalizedUrl.includes("instagram.com")) {
    return "instagram";
  }

  if (
    normalizedUrl.includes("xiaohongshu.com") || 
    normalizedUrl.includes("xiaohongshu.day") ||
    normalizedUrl.includes("xhslink.com")
  ) {
    return "xiaohongshu";
  }

  return "unknown";
}

