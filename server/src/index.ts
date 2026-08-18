import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";
import { localeMiddleware } from "./middleware/locale.js";
import { templatesRouter } from "./routes/templates.js";
import { mappingsRouter } from "./routes/mappings.js";
import { generateRouter } from "./routes/generate.js";
import { webhookRouter } from "./routes/webhook.js";
import { larkRouter } from "./routes/lark.js";
import { settingsRouter } from "./routes/settings.js";
import { scheduleOutputCleanup } from "./jobs/cleanup.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.cors.origin }));
  app.use(express.json({ limit: "10mb" }));
  app.use(morgan(config.nodeEnv === "development" ? "dev" : "combined"));
  app.use(localeMiddleware);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/templates", templatesRouter);
  app.use("/api/mappings", mappingsRouter);
  app.use("/api/lark", larkRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/webhook", webhookRouter);
  app.use("/api", generateRouter);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (err?.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "File too large." });
      return;
    }
    res.status(err?.status ?? 500).json({ error: err?.message ?? "Internal server error" });
  });

  return app;
}

if (process.env.VITEST !== "true") {
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Lark DocGen server listening on port ${config.port}`);
  });
  // Local copies of generated documents are scratch space, not the
  // permanent store (that's Lark's attachment field) — sweep stale ones.
  scheduleOutputCleanup();
}
