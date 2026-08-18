import { Router } from "express";
import { mappingsDb, templatesDb, jobsDb, outputFilesMetaDb } from "../db.js";
import { outputFiles } from "../storage/fileStore.js";
import { startBatchJob } from "../jobs/batchGenerate.js";
import { onJobUpdate } from "../jobs/jobManager.js";
import { larkClient } from "../lark/client.js";

export const generateRouter = Router();

generateRouter.post("/generate", async (req, res) => {
  const { templateId, mappingId, recordIds } = req.body as {
    templateId?: string;
    mappingId?: string;
    recordIds?: string[];
  };

  if (!templateId || !mappingId) {
    res.status(400).json({ error: "templateId and mappingId are required" });
    return;
  }
  if (!Array.isArray(recordIds) || recordIds.length === 0) {
    res.status(400).json({ error: req.t("errors.noRecordsSelected") });
    return;
  }

  const [template, mapping] = await Promise.all([templatesDb.get(templateId), mappingsDb.get(mappingId)]);
  if (!template) {
    res.status(404).json({ error: req.t("errors.templateNotFound") });
    return;
  }
  if (!mapping) {
    res.status(404).json({ error: req.t("errors.mappingNotFound") });
    return;
  }
  if (!larkClient.isConfigured()) {
    res.status(503).json({ error: req.t("errors.larkNotConfigured") });
    return;
  }

  const job = await startBatchJob({ template, mapping, recordIds, source: "manual" });
  res.status(202).json({ job });
});

generateRouter.get("/jobs", async (req, res) => {
  const templateId = typeof req.query.templateId === "string" ? req.query.templateId : undefined;
  const all = await jobsDb.all();
  const filtered = templateId ? all.filter((j) => j.templateId === templateId) : all;
  res.json({ jobs: filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100) });
});

generateRouter.get("/jobs/:id", async (req, res) => {
  const job = await jobsDb.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: req.t("errors.jobNotFound") });
    return;
  }
  res.json({ job });
});

/** Server-Sent Events stream of job progress, used by the "Generate" page's progress bar. */
generateRouter.get("/jobs/:id/stream", async (req, res) => {
  const job = await jobsDb.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: req.t("errors.jobNotFound") });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send(job);

  if (job.status === "completed" || job.status === "failed") {
    res.end();
    return;
  }

  const unsubscribe = onJobUpdate(job.id, (updated) => {
    send(updated);
    if (updated.status === "completed" || updated.status === "failed") {
      res.end();
    }
  });

  req.on("close", unsubscribe);
});

generateRouter.get("/outputs/:id", async (req, res) => {
  const meta = await outputFilesMetaDb.get(req.params.id);
  if (!meta || !(await outputFiles.exists(meta.id))) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  const buffer = await outputFiles.read(meta.id);
  res.setHeader("Content-Type", meta.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(meta.fileName)}"`);
  res.send(buffer);
});
