import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

describe("requireApiKey middleware", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "apikey-test-"));
    vi.resetModules();
    process.env.DATA_DIR = dataDir;
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it("rejects requests without a key", async () => {
    const { requireApiKey } = await import("../src/middleware/apiKey.js");
    const req: any = { header: () => undefined, query: {}, t: (k: string) => k };
    const json = vi.fn();
    const res: any = { status: vi.fn(() => ({ json })) };
    const next = vi.fn();

    await requireApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a matching X-API-Key header", async () => {
    const { getSettings } = await import("../src/settings.js");
    const { requireApiKey } = await import("../src/middleware/apiKey.js");
    const settings = await getSettings();

    const req: any = { header: (h: string) => (h === "x-api-key" ? settings.apiKey : undefined), query: {}, t: (k: string) => k };
    const res: any = { status: vi.fn() };
    const next = vi.fn();

    await requireApiKey(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a wrong key", async () => {
    const { requireApiKey } = await import("../src/middleware/apiKey.js");
    const req: any = { header: (h: string) => (h === "x-api-key" ? "wrong" : undefined), query: {}, t: (k: string) => k };
    const json = vi.fn();
    const res: any = { status: vi.fn(() => ({ json })) };
    const next = vi.fn();

    await requireApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
