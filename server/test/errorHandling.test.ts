import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
// Side-effect import, same as src/index.ts - must run before the route
// below is registered/hit.
import "express-async-errors";

/**
 * Regression test for a real incident: an async Express route handler that
 * throws/rejects becomes an *unhandled promise rejection* if nothing awaits
 * or .catches it (Express 4 doesn't forward it to error middleware on its
 * own). Since Node 15, an unhandled rejection terminates the whole process
 * by default — so any live-API error inside a route (a Lark auth/permission
 * failure, a network blip) would crash the entire server instead of
 * producing a normal error response. `express-async-errors` (imported at
 * the top of src/index.ts) patches this; these tests make sure that stays
 * true.
 */
describe("async route error handling", () => {
  it("forwards a thrown error from an async handler to error middleware (not a hang/crash)", async () => {
    // Mirrors src/index.ts's actual pattern: the patch is imported above
    // (module-level), then an async handler that throws, then the same
    // style of error middleware.
    const app = express();
    app.get("/boom", async () => {
      throw new Error("simulated Lark API failure");
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(err?.status ?? 500).json({ error: err?.message ?? "Internal server error" });
    });

    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("simulated Lark API failure");
  });

  describe("the real app", () => {
    let dataDir: string;
    let filesDir: string;

    beforeEach(async () => {
      dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "errhandling-data-"));
      filesDir = await fs.mkdtemp(path.join(os.tmpdir(), "errhandling-files-"));
      vi.resetModules();
      process.env.DATA_DIR = dataDir;
      process.env.FILES_DIR = filesDir;
    });

    afterEach(async () => {
      await fs.rm(dataDir, { recursive: true, force: true });
      await fs.rm(filesDir, { recursive: true, force: true });
      delete process.env.DATA_DIR;
      delete process.env.FILES_DIR;
    });

    it("responds normally end-to-end (createApp wiring + local store)", async () => {
      const { createApp } = await import("../src/index.js");
      const app = createApp();

      const res = await request(app).get("/api/templates");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ templates: [] });
    });
  });
});
