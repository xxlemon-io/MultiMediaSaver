import { NextRequest, NextResponse } from "next/server";
import { createWriteStream } from "fs";
import { access, mkdir } from "fs/promises";
import { join, basename } from "path";
import { randomUUID } from "crypto";
import archiver from "archiver";

const BASE_DOWNLOADS_DIR = join(process.cwd(), "tmp", "downloads");

function getSessionDir(sessionId?: string): string {
  if (sessionId) {
    return join(BASE_DOWNLOADS_DIR, sessionId);
  }
  return BASE_DOWNLOADS_DIR;
}

class DownloadAllError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DownloadAllError";
    this.status = status;
  }
}

interface DownloadAssetInput {
  downloadUrl?: string;
  filename?: string;
}

interface DownloadAllResponse {
  ok: boolean;
  zipUrl?: string;
  message?: string;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveAssetPath(asset: DownloadAssetInput, sessionId?: string) {
  if (!asset.downloadUrl || typeof asset.downloadUrl !== "string") {
    throw new DownloadAllError("Missing download URL for asset", 400);
  }

  // Handle /api/downloads/ path with optional session parameter
  let normalized = asset.downloadUrl.replace(/^\/+/, "");
  let filename: string;
  let extractedSessionId: string | undefined;
  
  if (normalized.startsWith("api/downloads/")) {
    // Extract filename and session from URL
    const urlParts = normalized.replace("api/downloads/", "").split("?");
    filename = urlParts[0];
    
    // Extract session from query string if present
    if (urlParts[1]) {
      const params = new URLSearchParams(urlParts[1]);
      extractedSessionId = params.get("session") || undefined;
    }
  } else {
    throw new DownloadAllError("Invalid asset path", 400);
  }

  // Use sessionId from parameter or extracted from URL
  const finalSessionId = sessionId || extractedSessionId;
  const downloadsDir = getSessionDir(finalSessionId);
  const absolutePath = join(downloadsDir, filename);
  
  try {
    await access(absolutePath);
  } catch {
    throw new DownloadAllError("Asset file not found", 404);
  }

  const safeFilename =
    asset.filename && typeof asset.filename === "string" && asset.filename.trim().length > 0
      ? asset.filename.trim()
      : basename(absolutePath);

  return {
    absolutePath,
    filename: safeFilename,
    sessionId: finalSessionId,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const assetsInput: DownloadAssetInput[] = Array.isArray(body?.assets) ? body.assets : [];
    const sessionId = body?.sessionId || request.nextUrl.searchParams.get("session") || undefined;

    if (assetsInput.length === 0) {
      return NextResponse.json<DownloadAllResponse>(
        { ok: false, message: "No assets provided" },
        { status: 400 }
      );
    }

    const downloadsDir = getSessionDir(sessionId);
    await mkdir(downloadsDir, { recursive: true });

    const files = await Promise.all(assetsInput.map((asset) => resolveAssetPath(asset, sessionId)));

    // Use the sessionId from the first resolved file (they should all be the same)
    const finalSessionId = files[0]?.sessionId || sessionId;
    const finalDownloadsDir = getSessionDir(finalSessionId);

    const zipFilename = `${Date.now()}-${randomUUID().slice(0, 8)}.zip`;
    const zipPath = join(finalDownloadsDir, zipFilename);
    const zipUrl = finalSessionId
      ? `/api/downloads/${zipFilename}?session=${finalSessionId}`
      : `/api/downloads/${zipFilename}`;

    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    const archivePromise = new Promise<void>((resolve, reject) => {
      output.on("close", () => resolve());
      output.on("error", (error) => reject(error));
      archive.on("error", (error) => reject(error));
    });

    archive.pipe(output);

    files.forEach(({ absolutePath, filename }) => {
      archive.file(absolutePath, { name: filename });
    });

    await archive.finalize();
    await archivePromise;

    return NextResponse.json<DownloadAllResponse>({
      ok: true,
      zipUrl,
    });
  } catch (error) {
    console.error("[API] Download all error:", error);
    const status =
      error instanceof DownloadAllError
        ? error.status
        : 500;
    return NextResponse.json<DownloadAllResponse>(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to create download archive",
      },
      { status }
    );
  }
}


