export type ProviderType = "twitter" | "instagram" | "unknown";

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

  return "unknown";
}

