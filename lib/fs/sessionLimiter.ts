import { readdir, stat, rm, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const BASE_DOWNLOADS_DIR = join(process.cwd(), "tmp", "downloads");
const SESSION_METADATA_FILE = join(BASE_DOWNLOADS_DIR, ".sessions.json");
const MAX_SESSIONS_PER_USER = 5; // Maximum sessions per IP address

interface SessionMetadata {
  sessionId: string;
  ip: string;
  createdAt: number;
}

interface SessionsMap {
  [sessionId: string]: {
    ip: string;
    createdAt: number;
  };
}

/**
 * Get client IP address from request
 */
export function getClientIp(request: Request): string {
  // Try to get IP from various headers (for proxies/load balancers)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // Fallback: use a default identifier if IP cannot be determined
  return "unknown";
}

/**
 * Load session metadata from file
 */
async function loadSessionMetadata(): Promise<SessionsMap> {
  try {
    const data = await readFile(SESSION_METADATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

/**
 * Save session metadata to file
 */
async function saveSessionMetadata(metadata: SessionsMap): Promise<void> {
  try {
    await mkdir(BASE_DOWNLOADS_DIR, { recursive: true });
    await writeFile(SESSION_METADATA_FILE, JSON.stringify(metadata, null, 2), "utf-8");
  } catch (error) {
    console.error("[SessionLimit] Error saving metadata:", error);
    // Don't throw - metadata is not critical
  }
}

/**
 * Register a new session with IP address
 */
export async function registerSession(sessionId: string, clientIp: string): Promise<void> {
  const metadata = await loadSessionMetadata();
  metadata[sessionId] = {
    ip: clientIp,
    createdAt: Date.now(),
  };
  await saveSessionMetadata(metadata);
}

/**
 * Remove session from metadata
 */
export async function unregisterSession(sessionId: string): Promise<void> {
  const metadata = await loadSessionMetadata();
  delete metadata[sessionId];
  await saveSessionMetadata(metadata);
}

/**
 * Get sessions for a specific IP address
 */
async function getSessionsForIp(clientIp: string): Promise<SessionMetadata[]> {
  const metadata = await loadSessionMetadata();
  const sessions: SessionMetadata[] = [];

  for (const [sessionId, info] of Object.entries(metadata)) {
    if (info.ip === clientIp) {
      // Check if session directory still exists
      const sessionDir = join(BASE_DOWNLOADS_DIR, sessionId);
      try {
        await stat(sessionDir);
        sessions.push({
          sessionId,
          ip: info.ip,
          createdAt: info.createdAt,
        });
      } catch {
        // Session directory doesn't exist, remove from metadata
        delete metadata[sessionId];
      }
    }
  }

  // Save cleaned metadata
  if (Object.keys(metadata).length !== Object.keys(await loadSessionMetadata()).length) {
    await saveSessionMetadata(metadata);
  }

  return sessions;
}

/**
 * Check and enforce session limit for a user (IP address)
 * If limit exceeded, delete oldest sessions for that IP
 */
export async function enforceSessionLimit(clientIp: string): Promise<void> {
  const sessions = await getSessionsForIp(clientIp);

  if (sessions.length >= MAX_SESSIONS_PER_USER) {
    // Sort by creation time (oldest first)
    sessions.sort((a, b) => a.createdAt - b.createdAt);

    // Delete oldest sessions until we're under the limit
    const sessionsToDelete = sessions.slice(0, sessions.length - MAX_SESSIONS_PER_USER + 1);

    for (const session of sessionsToDelete) {
      const sessionDir = join(BASE_DOWNLOADS_DIR, session.sessionId);
      try {
        await rm(sessionDir, { recursive: true, force: true });
        await unregisterSession(session.sessionId);
        console.log(`[SessionLimit] Removed old session for IP ${clientIp}: ${session.sessionId}`);
      } catch (error) {
        console.error(`[SessionLimit] Error removing session ${session.sessionId}:`, error);
      }
    }
  }
}

