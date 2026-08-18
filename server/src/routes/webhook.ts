import { Router } from "express";
import { mappingsDb, templatesDb } from "../db.js";
import { startBatchJob } from "../jobs/batchGenerate.js";
import { requireApiKey } from "../middleware/apiKey.js";
import { larkClient } from "../lark/client.js";

export const webhookRouter = Router();

/**
 * Called from a Lark Base Automation rule's "Send webhook request" action.
 * Protected by `X-API-Key` (see middleware/apiKey.ts and Settings page for
 * the key). Recommended automation setup:
 *   Trigger: record created / record matches condition / button clicked
 *   Action:  Send webhook request -> POST this URL with:
 *     { "mapping_id": "...", "record_id": "{{Record ID}}" }
 * See docs/WEBHOOK.md for the full walkthrough.
 */
webhookRouter.post("/generate", requireApiKey, async (req, res) => {
  const body = req.body as {
    mapping_id?: string;
    template_id?: string;
    record_id?: string;
    record_ids?: string[];
  };

  const mappingId = body.mapping_id;
  if (!mappingId) {
    res.status(400).json({ error: "mapping_id is required" });
    return;
  }
  const mapping = await mappingsDb.get(mappingId);
  if (!mapping) {
    res.status(404).json({ error: req.t("errors.mappingNotFound") });
    return;
  }
  const template = await templatesDb.get(body.template_id ?? mapping.templateId);
  if (!template) {
    res.status(404).json({ error: req.t("errors.templateNotFound") });
    return;
  }
  if (!larkClient.isConfigured()) {
    res.status(503).json({ error: req.t("errors.larkNotConfigured") });
    return;
  }

  const recordIds = body.record_ids ?? (body.record_id ? [body.record_id] : []);
  if (recordIds.length === 0) {
    res.status(400).json({ error: req.t("errors.noRecordsSelected") });
    return;
  }

  const job = await startBatchJob({ template, mapping, recordIds, source: "webhook" });
  res.status(202).json({ message: req.t("webhook.triggered"), jobId: job.id });
});
