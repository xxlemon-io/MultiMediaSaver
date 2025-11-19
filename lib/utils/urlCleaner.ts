/**
 * Remove query parameters and hash from URL
 * @param url - The URL to clean
 * @returns Cleaned URL without query parameters and hash
 */
export function cleanUrl(url: string): string {
  if (!url || typeof url !== "string") {
    return url;
  }

  // Remove query parameters (?) and hash (#)
  return url.split("?")[0].split("#")[0].trim();
}

