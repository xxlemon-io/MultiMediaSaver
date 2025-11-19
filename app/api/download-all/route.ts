import { NextRequest, NextResponse } from "next/server";
import { createWriteStream } from "fs";
import { access, mkdir } from "fs/promises";
import { join, basename } from "path";
import { randomUUID } from "crypto";
import archiver from "archiver";

const PUBLIC_DIR = join(process.cwd(), "public");
const DOWNLOADS_DIR = join(PUBLIC_DIR, "downloads");

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

async function resolveAssetPath(asset: DownloadAssetInput) {
  if (!asset.downloadUrl || typeof asset.downloadUrl !== "string") {
    throw new DownloadAllError("Missing download URL for asset", 400);
  }

  const normalized = asset.downloadUrl.replace(/^\/+/, "");
  if (!normalized.startsWith("downloads/")) {
    throw new DownloadAllError("Invalid asset path", 400);
  }

  const absolutePath = join(PUBLIC_DIR, normalized);
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
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const assetsInput: DownloadAssetInput[] = Array.isArray(body?.assets) ? body.assets : [];

    if (assetsInput.length === 0) {
      return NextResponse.json<DownloadAllResponse>(
        { ok: false, message: "No assets provided" },
        { status: 400 }
      );
    }

    await mkdir(DOWNLOADS_DIR, { recursive: true });

    const files = await Promise.all(assetsInput.map(resolveAssetPath));

    const zipFilename = `${Date.now()}-${randomUUID().slice(0, 8)}.zip`;
    const zipPath = join(DOWNLOADS_DIR, zipFilename);
    const zipUrl = `/downloads/${zipFilename}`;

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


