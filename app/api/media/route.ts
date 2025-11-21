import { NextRequest, NextResponse } from "next/server";
import { detectProvider } from "@/lib/media/detector";
import { twitterProvider } from "@/lib/media/fetchers/twitter";
import { instagramProvider } from "@/lib/media/fetchers/instagram";
import { xiaohongshuProvider } from "@/lib/media/fetchers/xiaohongshu";
import { ApiResponse } from "@/lib/media/types";
import { cleanUrl } from "@/lib/utils/urlCleaner";
import { processXhsInput } from "@/lib/utils/xhsLinkResolver";
import { resetSessionDownloadsDir } from "@/lib/fs/resetDownloads";
import { cleanupExpiredSessions } from "@/lib/fs/cleanupSessions";
import { getClientIp, enforceSessionLimit, registerSession } from "@/lib/fs/sessionLimiter";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          message: "Invalid URL provided",
        },
        { status: 400 }
      );
    }

    console.log("[API] Received URL:", url);

    // Process input to resolve xhslink.com short links
    let processedInput = url;
    const detectedProvider = detectProvider(url);
    
    if (detectedProvider === "xiaohongshu") {
      try {
        processedInput = await processXhsInput(url);
        console.log("[API] Resolved XHS link:", processedInput);
      } catch (error) {
        console.error("[API] Failed to resolve XHS link:", error);
        // Continue with original input
      }
    }

    // Detect provider using processed input
    const provider = detectProvider(processedInput);
    console.log("[API] Detected provider:", provider);

    // For xiaohongshu, keep query parameters (needed for tokens)
    // For other providers, clean the URL
    const processedUrl = provider === "xiaohongshu" ? processedInput : cleanUrl(processedInput);
    console.log("[API] Processed URL:", processedUrl);

    if (provider === "unknown") {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          message: "Unsupported URL. Please provide a Twitter/X, Instagram, or xhs(rednote) link.",
        },
        { status: 400 }
      );
    }

    // Get client IP address
    const clientIp = getClientIp(request);
    console.log(`[API] Client IP: ${clientIp}`);

    // Enforce session limit for this IP (delete oldest if needed)
    await enforceSessionLimit(clientIp);

    // Generate session ID for this request
    const sessionId = randomUUID();
    console.log(`[API] Generated session ID: ${sessionId}`);

    // Register the new session
    await registerSession(sessionId, clientIp);

    // Asynchronously cleanup expired sessions (don't block the request)
    cleanupExpiredSessions().catch((error) => {
      console.error("[API] Cleanup error (non-blocking):", error);
    });

    // Reset session-specific downloads directory
    await resetSessionDownloadsDir(sessionId);

    let assets;
    try {
      console.log(`[API] Fetching media for ${provider}...`);
      if (provider === "twitter") {
        assets = await twitterProvider.fetchMedia(processedUrl, sessionId);
      } else if (provider === "instagram") {
        assets = await instagramProvider.fetchMedia(processedUrl, sessionId);
      } else if (provider === "xiaohongshu") {
        assets = await xiaohongshuProvider.fetchMedia(processedUrl, sessionId);
      } else {
        throw new Error("Unsupported provider");
      }
      console.log(`[API] Successfully fetched ${assets.length} media assets`);
    } catch (error) {
      console.error(`[API] Error fetching media for ${provider}:`, error);
      let message = "Failed to fetch media";
      let statusCode = 500;

      if (error instanceof Error) {
        message = error.message;

        // Categorize errors for better user experience
        // Note: Twitter parser should automatically use fallback if not configured,
        // so this error should only occur for Instagram or if there's a configuration issue
        // Check for actual configuration errors (not just mentions of PARSER_ENDPOINT in tips)
        if (message.includes("is not configured") || message.includes("not configured. Please set")) {
          if (provider === "instagram") {
            message = "Instagram parser service is not configured. Please set INSTAGRAM_PARSER_ENDPOINT in .env.local or wait for Instagram support.";
            statusCode = 501; // Not implemented
          } else {
            message = "Parser service configuration error. Please check your environment variables.";
            statusCode = 503;
          }
        } else if (message.includes("timeout")) {
          message = "Request timed out. Please try again.";
          statusCode = 504;
        } else if (message.includes("No media found")) {
          message = "No images or videos found in this post.";
          statusCode = 404;
        } else if (message.includes("coming soon")) {
          statusCode = 501; // Not implemented
        }
      }

      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          message,
        },
        { status: statusCode }
      );
    }

    return NextResponse.json<ApiResponse>({
      ok: true,
      assets,
      sessionId,
    });
  } catch (error) {
    return NextResponse.json<ApiResponse>(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}

