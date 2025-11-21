/**
 * Extract xhslink.com short links from text and resolve them to full URLs
 */

/**
 * Extract xhslink.com URLs from text (including share strings)
 */
export function extractXhsLinks(text: string): string[] {
  const urlRegex = /https?:\/\/xhslink\.com\/[^\s\)]+/gi;
  const matches = text.match(urlRegex);
  return matches || [];
}

/**
 * Resolve xhslink.com short link to full xiaohongshu.com URL
 * @param shortUrl - The short link (e.g., http://xhslink.com/o/8fIjterW6Zu)
 * @returns The resolved full URL
 */
export async function resolveXhsShortLink(shortUrl: string): Promise<string> {
  try {
    // Follow redirects to get the final URL
    const response = await fetch(shortUrl, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    // Get the final URL after redirects
    const finalUrl = response.url;

    // If it's already a full xiaohongshu.com URL, return it
    if (finalUrl.includes("xiaohongshu.com")) {
      return finalUrl;
    }

    // If redirect didn't work, try GET request
    const getResponse = await fetch(shortUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    return getResponse.url;
  } catch (error) {
    throw new Error(`Failed to resolve short link: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Process input text/URL to extract and resolve xhslink.com links
 * @param input - User input (could be a URL or share string)
 * @returns Resolved full URL or original input if no xhslink found
 */
export async function processXhsInput(input: string): Promise<string> {
  // Extract xhslink.com URLs from the input
  const xhsLinks = extractXhsLinks(input);

  if (xhsLinks.length === 0) {
    // No xhslink found, return original input
    return input;
  }

  // Use the first xhslink found
  const shortLink = xhsLinks[0];
  
  try {
    // Resolve the short link
    const resolvedUrl = await resolveXhsShortLink(shortLink);
    return resolvedUrl;
  } catch (error) {
    // If resolution fails, return original input
    console.error("[XHS Link Resolver] Failed to resolve:", error);
    return input;
  }
}

