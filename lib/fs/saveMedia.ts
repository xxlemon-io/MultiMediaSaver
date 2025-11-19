import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const DOWNLOADS_DIR = join(process.cwd(), "tmp", "downloads");
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

interface SaveMediaResult {
  publicPath: string;
  filename: string;
}

function getExtensionFromContentType(contentType: string): string {
  const contentTypeMap: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/x-msvideo": ".avi",
  };

  return contentTypeMap[contentType.toLowerCase()] || ".bin";
}

function generateFilename(contentType: string, suggestedName?: string): string {
  const timestamp = Date.now();
  const uuid = randomUUID().substring(0, 8);
  let ext = ".bin";

  if (suggestedName) {
    const match = suggestedName.match(/\.(\w+)$/);
    if (match) {
      ext = `.${match[1]}`;
    }
  }

  if (ext === ".bin") {
    ext = getExtensionFromContentType(contentType);
  }

  return `${timestamp}-${uuid}${ext}`;
}

export async function saveMedia(
  buffer: Buffer,
  contentType: string,
  suggestedName?: string
): Promise<SaveMediaResult> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  try {
    await mkdir(DOWNLOADS_DIR, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw new Error(`Failed to create downloads directory: ${error}`);
    }
  }

  const filename = generateFilename(contentType, suggestedName);
  const filePath = join(DOWNLOADS_DIR, filename);

  try {
    await writeFile(filePath, buffer);
  } catch (error) {
    throw new Error(`Failed to save file: ${error}`);
  }

  return {
    publicPath: `/api/downloads/${filename}`,
    filename,
  };
}

