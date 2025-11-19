import { readdir, stat, rm, mkdir } from "fs/promises";
import { join } from "path";

const DOWNLOADS_DIR = join(process.cwd(), "tmp", "downloads");

export async function resetDownloadsDir() {
  try {
    // 判断是否存在 —— 避免首次执行报错
    const files = await readdir(DOWNLOADS_DIR);

    for (const file of files) {
      const filePath = join(DOWNLOADS_DIR, file);
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
      await mkdir(DOWNLOADS_DIR, { recursive: true });
    } else {
      throw err;
    }
  }
}