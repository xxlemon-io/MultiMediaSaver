import { NextRequest, NextResponse } from "next/server";
import { readFile, access } from "fs/promises";
import { join } from "path";

const BASE_DOWNLOADS_DIR = join(process.cwd(), "tmp", "downloads");

function getSessionDir(sessionId?: string): string {
  if (sessionId) {
    return join(BASE_DOWNLOADS_DIR, sessionId);
  }
  return BASE_DOWNLOADS_DIR;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const filename = params.filename;
    
    if (!filename || typeof filename !== "string") {
      return NextResponse.json(
        { error: "Invalid filename" },
        { status: 400 }
      );
    }

    // Security: Prevent directory traversal
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json(
        { error: "Invalid filename" },
        { status: 400 }
      );
    }

    // Get sessionId from query parameter
    const sessionId = request.nextUrl.searchParams.get("session") || undefined;
    
    // Security: Validate sessionId format (should be UUID)
    if (sessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      return NextResponse.json(
        { error: "Invalid session ID" },
        { status: 400 }
      );
    }

    const downloadsDir = getSessionDir(sessionId);
    const filePath = join(downloadsDir, filename);

    // Check if file exists
    try {
      await access(filePath);
    } catch {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Get file stats for content-length and range support
    const fs = require('fs');
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    // Determine content type from filename
    const ext = filename.split(".").pop()?.toLowerCase();
    const contentTypeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      zip: "application/zip",
    };

    const contentType = ext ? contentTypeMap[ext] || "application/octet-stream" : "application/octet-stream";
    const isVideo = ext && ["mp4", "mov", "avi", "webm"].includes(ext);

    // Handle Range requests for video (required for iOS)
    const range = request.headers.get("range");
    
    if (range && isVideo) {
      // Parse range header
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      // Read file chunk
      const file = fs.createReadStream(filePath, { start, end });
      const chunks: Buffer[] = [];
      
      for await (const chunk of file) {
        chunks.push(chunk);
      }
      
      const buffer = Buffer.concat(chunks);

      return new NextResponse(buffer, {
        status: 206, // Partial Content
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize.toString(),
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range",
        },
      });
    }

    // Read full file for non-range requests
    const fileBuffer = await readFile(filePath);
    
    const contentDisposition = isVideo
      ? `inline; filename="${filename}"`
      : `attachment; filename="${filename}"`;

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
        "Content-Length": fileSize.toString(),
        "Cache-Control": "public, max-age=3600",
        "Accept-Ranges": isVideo ? "bytes" : "none",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range",
      },
    });
  } catch (error) {
    console.error("[API] Download error:", error);
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 }
    );
  }
}

