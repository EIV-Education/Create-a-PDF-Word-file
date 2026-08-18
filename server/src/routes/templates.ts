import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { templatesDb } from "../db.js";
import { templateFiles } from "../storage/fileStore.js";
import { extractPlaceholders } from "../template/placeholders.js";
import type { TemplateRecord } from "../models.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const templatesRouter = Router();

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

templatesRouter.get("/", async (_req, res) => {
  const templates = await templatesDb.all();
  res.json({ templates: templates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
});

templatesRouter.get("/:id", async (req, res) => {
  const template = await templatesDb.get(req.params.id);
  if (!template) {
    res.status(404).json({ error: req.t("errors.templateNotFound") });
    return;
  }
  res.json({ template });
});

templatesRouter.post("/", upload.single("file"), async (req, res) => {
  const file = req.file;
  const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : file?.originalname;

  if (!file || (!file.originalname.toLowerCase().endsWith(".docx") && file.mimetype !== DOCX_MIME)) {
    res.status(400).json({ error: req.t("errors.invalidUpload") });
    return;
  }

  let placeholders;
  try {
    placeholders = extractPlaceholders(file.buffer);
  } catch (err) {
    res.status(400).json({ error: req.t("errors.invalidUpload"), detail: err instanceof Error ? err.message : String(err) });
    return;
  }

  const id = randomUUID();
  await templateFiles.save(id, file.buffer);

  const now = new Date().toISOString();
  const record: TemplateRecord = {
    id,
    name: name ?? file.originalname,
    originalFilename: file.originalname,
    fileId: id,
    placeholders,
    sizeBytes: file.buffer.length,
    createdAt: now,
    updatedAt: now,
  };
  await templatesDb.insert(record);
  res.status(201).json({ template: record, message: req.t("template.uploaded") });
});

templatesRouter.get("/:id/download", async (req, res) => {
  const template = await templatesDb.get(req.params.id);
  if (!template) {
    res.status(404).json({ error: req.t("errors.templateNotFound") });
    return;
  }
  const buffer = await templateFiles.read(template.fileId);
  res.setHeader("Content-Type", DOCX_MIME);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(template.originalFilename)}"`);
  res.send(buffer);
});

templatesRouter.delete("/:id", async (req, res) => {
  const template = await templatesDb.get(req.params.id);
  if (!template) {
    res.status(404).json({ error: req.t("errors.templateNotFound") });
    return;
  }
  await templateFiles.remove(template.fileId);
  await templatesDb.remove(template.id);
  res.status(204).end();
});
