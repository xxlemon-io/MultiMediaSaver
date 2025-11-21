import { readdir, stat, rm, mkdir } from "fs/promises";
import { join } from "path";

const BASE_DOWNLOADS_DIR = join(process.cwd(), "tmp", "downloads");

function getSessionDir(sessionId: string): string {
  return join(BASE_DOWNLOADS_DIR, sessionId);
}

export async function resetSessionDownloadsDir(sessionId: string) {
  const sessionDir = getSessionDir(sessionId);
  
  try {
    // 判断是否存在 —— 避免首次执行报错
    const files = await readdir(sessionDir);

    for (const file of files) {
      const filePath = join(sessionDir, file);
      const fileStat = await stat(filePath);

      if (fileStat.isDirectory()) {
        await rm(filePath, { recursive: true, force: true });
      } else {
        await rm(filePath, { force: true });
      }
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      // 如果目录不存在，自动创建
      await mkdir(sessionDir, { recursive: true });
    } else {
      throw err;
    }
  }
}

// 向后兼容：保留旧函数名，但标记为已废弃
export async function resetDownloadsDir() {
  // 如果没有 sessionId，清空整个 downloads 目录（向后兼容）
  try {
    const files = await readdir(BASE_DOWNLOADS_DIR);

    for (const file of files) {
      const filePath = join(BASE_DOWNLOADS_DIR, file);
      const fileStat = await stat(filePath);

      if (fileStat.isDirectory()) {
        await rm(filePath, { recursive: true, force: true });
      } else {
        await rm(filePath, { force: true });
      }
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      await mkdir(BASE_DOWNLOADS_DIR, { recursive: true });
    } else {
      throw err;
    }
  }
}