import { NextRequest, NextResponse } from "next/server";
import { detectProvider } from "@/lib/media/detector";
import { twitterProvider } from "@/lib/media/fetchers/twitter";
import { instagramProvider } from "@/lib/media/fetchers/instagram";
import { ApiResponse } from "@/lib/media/types";
import { cleanUrl } from "@/lib/utils/urlCleaner";

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

    // Remove query parameters and hash from URL
    const cleanedUrl = cleanUrl(url);
    console.log("[API] Received URL:", url);
    console.log("[API] Cleaned URL:", cleanedUrl);

    const provider = detectProvider(cleanedUrl);
    console.log("[API] Detected provider:", provider);

    if (provider === "unknown") {
      return NextResponse.json<ApiResponse>(
        {
          ok: false,
          message: "Unsupported URL. Please provide a Twitter/X or Instagram link.",
        },
        { status: 400 }
      );
    }

    let assets;
    try {
      console.log(`[API] Fetching media for ${provider}...`);
      if (provider === "twitter") {
        assets = await twitterProvider.fetchMedia(cleanedUrl);
      } else if (provider === "instagram") {
        assets = await instagramProvider.fetchMedia(cleanedUrl);
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

