import { readdir, stat, rm } from "fs/promises";
import { join } from "path";
import { unregisterSession } from "./sessionLimiter";

const BASE_DOWNLOADS_DIR = join(process.cwd(), "tmp", "downloads");

// Cleanup age: 1 hour (in milliseconds)
const CLEANUP_AGE_MS = 60 * 60 * 1000;

export async function cleanupExpiredSessions(): Promise<number> {
  const now = Date.now();
  let cleanedCount = 0;

  try {
    // Check if base directory exists
    const entries = await readdir(BASE_DOWNLOADS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      // Only process directories (session folders)
      if (!entry.isDirectory()) {
        continue;
      }

      const sessionDir = join(BASE_DOWNLOADS_DIR, entry.name);
      
      try {
        // Get directory stats to check last modification time
        const dirStat = await stat(sessionDir);
        const age = now - dirStat.mtimeMs;

        // If directory is older than cleanup age, delete it
        if (age > CLEANUP_AGE_MS) {
          await rm(sessionDir, { recursive: true, force: true });
          await unregisterSession(entry.name);
          cleanedCount++;
          console.log(`[Cleanup] Removed expired session: ${entry.name} (age: ${Math.round(age / 1000 / 60)} minutes)`);
        }
      } catch (error) {
        // Log error but continue with other directories
        console.error(`[Cleanup] Error processing session ${entry.name}:`, error);
      }
    }
  } catch (error: any) {
    // If directory doesn't exist, that's fine - nothing to clean
    if (error.code === "ENOENT") {
      return 0;
    }
    // Re-throw other errors
    throw error;
  }

  if (cleanedCount > 0) {
    console.log(`[Cleanup] Cleaned up ${cleanedCount} expired session(s)`);
  }

  return cleanedCount;
}

