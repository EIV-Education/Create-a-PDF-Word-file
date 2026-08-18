import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

describe("cleanupOldOutputs", () => {
  let dataDir: string;
  let filesDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-test-data-"));
    filesDir = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-test-files-"));
    vi.resetModules();
    process.env.DATA_DIR = dataDir;
    process.env.FILES_DIR = filesDir;
    process.env.OUTPUT_FILE_TTL_HOURS = "24";
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    await fs.rm(filesDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    delete process.env.FILES_DIR;
    delete process.env.OUTPUT_FILE_TTL_HOURS;
  });

  it("deletes files older than the TTL and keeps recent ones", async () => {
    const { outputFilesMetaDb } = await import("../src/db.js");
    const { outputFiles } = await import("../src/storage/fileStore.js");
    const { cleanupOldOutputs } = await import("../src/jobs/cleanup.js");

    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const recent = new Date().toISOString();

    await outputFiles.save("old-id", Buffer.from("old"));
    await outputFilesMetaDb.insert({ id: "old-id", fileName: "old.docx", contentType: "text/plain", createdAt: old });

    await outputFiles.save("new-id", Buffer.from("new"));
    await outputFilesMetaDb.insert({ id: "new-id", fileName: "new.docx", contentType: "text/plain", createdAt: recent });

    const deleted = await cleanupOldOutputs();

    expect(deleted).toBe(1);
    expect(await outputFiles.exists("old-id")).toBe(false);
    expect(await outputFiles.exists("new-id")).toBe(true);
    expect(await outputFilesMetaDb.get("old-id")).toBeUndefined();
    expect(await outputFilesMetaDb.get("new-id")).toBeDefined();
  });

  it("is a no-op when the TTL is disabled (0)", async () => {
    process.env.OUTPUT_FILE_TTL_HOURS = "0";
    vi.resetModules();
    const { outputFilesMetaDb } = await import("../src/db.js");
    const { outputFiles } = await import("../src/storage/fileStore.js");
    const { cleanupOldOutputs } = await import("../src/jobs/cleanup.js");

    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await outputFiles.save("old-id", Buffer.from("old"));
    await outputFilesMetaDb.insert({ id: "old-id", fileName: "old.docx", contentType: "text/plain", createdAt: old });

    const deleted = await cleanupOldOutputs();

    expect(deleted).toBe(0);
    expect(await outputFiles.exists("old-id")).toBe(true);
  });
});
