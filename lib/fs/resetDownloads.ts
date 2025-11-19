import { mkdir, rm } from "fs/promises";
import { join } from "path";

const DOWNLOADS_DIR = join(process.cwd(), "public", "downloads");

export async function resetDownloadsDir() {
  await rm(DOWNLOADS_DIR, { recursive: true, force: true });
  await mkdir(DOWNLOADS_DIR, { recursive: true });
}


