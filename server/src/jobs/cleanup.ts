import { outputFilesMetaDb } from "../db.js";
import { outputFiles } from "../storage/fileStore.js";
import { config } from "../config.js";

/**
 * Deletes generated docx/pdf files (and their metadata row) older than the
 * configured TTL. Generated documents are meant to live permanently in
 * Lark's attachment field, not on this server — the local copy only exists
 * briefly so the UI's "download" link works right after generation, so it's
 * safe (and intended) to sweep it away on a schedule rather than needing
 * persistent, ever-growing disk space for it.
 */
export async function cleanupOldOutputs(): Promise<number> {
  const ttlMs = config.outputs.ttlHours * 60 * 60 * 1000;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return 0;

  const cutoff = Date.now() - ttlMs;
  const all = await outputFilesMetaDb.all();
  const stale = all.filter((f) => new Date(f.createdAt).getTime() < cutoff);

  for (const f of stale) {
    await outputFiles.remove(f.id);
    await outputFilesMetaDb.remove(f.id);
  }
  return stale.length;
}

/** Runs the sweep now and then on a fixed interval for the life of the process. */
export function scheduleOutputCleanup(intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  void cleanupOldOutputs().catch((err) => console.error("Output cleanup failed:", err));
  return setInterval(() => {
    void cleanupOldOutputs().catch((err) => console.error("Output cleanup failed:", err));
  }, intervalMs);
}
