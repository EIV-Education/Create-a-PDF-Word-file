import { Router } from "express";
import { randomUUID } from "node:crypto";
import { mappingsDb, templatesDb } from "../db.js";
import { larkClient } from "../lark/client.js";
import { fieldTypeLabel } from "../lark/fieldTypes.js";
import { slugifyFieldNames } from "../utils/slugify.js";
import { suggestFieldMatches } from "../mapping/autoMatch.js";
import type { FieldMappingEntry, MappingRecord, OutputFormat } from "../models.js";

export const mappingsRouter = Router();

mappingsRouter.get("/", async (req, res) => {
  const templateId = typeof req.query.templateId === "string" ? req.query.templateId : undefined;
  const all = await mappingsDb.all();
  const filtered = templateId ? all.filter((m) => m.templateId === templateId) : all;
  res.json({ mappings: filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
});

mappingsRouter.get("/:id", async (req, res) => {
  const mapping = await mappingsDb.get(req.params.id);
  if (!mapping) {
    res.status(404).json({ error: req.t("errors.mappingNotFound") });
    return;
  }
  res.json({ mapping });
});

/**
 * Convenience endpoint: given a template's extracted placeholder tags and a
 * Lark table's fields, auto-match tags to fields by slugified name so the
 * mapping UI can pre-fill instead of starting from a blank table.
 */
mappingsRouter.get("/suggest/:templateId", async (req, res) => {
  const template = await templatesDb.get(req.params.templateId);
  if (!template) {
    res.status(404).json({ error: req.t("errors.templateNotFound") });
    return;
  }
  const appToken = String(req.query.appToken ?? "");
  const tableId = String(req.query.tableId ?? "");
  if (!appToken || !tableId) {
    res.status(400).json({ error: "Missing appToken or tableId" });
    return;
  }

  const fields = await larkClient.listFields(appToken, tableId);
  // suggestedTag (display only, on availableFields) is a distinct concern
  // from matching: it's "what tag would this field suggest", not part of
  // the actual match comparison (see mapping/autoMatch.ts).
  const tagByFieldName = slugifyFieldNames(fields.map((f) => f.field_name));
  const suggestions = suggestFieldMatches(template.placeholders, fields);

  // Normalize to the same { fieldId, fieldName, type, typeLabel } shape as
  // GET /api/lark/fields (not Lark's raw snake_case field_id/field_name) -
  // the Mapping page's <select> options are keyed by `fieldId`, so
  // returning the raw shape here left every option's value undefined and
  // the dropdown silently unable to show the (correctly matched!) selection.
  res.json({
    suggestions,
    availableFields: fields.map((f) => ({
      fieldId: f.field_id,
      fieldName: f.field_name,
      type: f.type,
      typeLabel: fieldTypeLabel(f.type),
      suggestedTag: tagByFieldName.get(f.field_name),
    })),
  });
});

mappingsRouter.post("/", async (req, res) => {
  const body = req.body as Partial<MappingRecord>;
  if (!body.templateId || !body.larkAppToken || !body.larkTableId || !Array.isArray(body.fields)) {
    res.status(400).json({ error: "templateId, larkAppToken, larkTableId and fields are required" });
    return;
  }
  const template = await templatesDb.get(body.templateId);
  if (!template) {
    res.status(404).json({ error: req.t("errors.templateNotFound") });
    return;
  }

  const now = new Date().toISOString();
  const mapping: MappingRecord = {
    id: randomUUID(),
    templateId: body.templateId,
    name: body.name?.trim() || template.name,
    larkAppToken: body.larkAppToken,
    larkTableId: body.larkTableId,
    outputAttachmentFieldId: body.outputAttachmentFieldId,
    outputAttachmentFieldName: body.outputAttachmentFieldName,
    fields: body.fields as FieldMappingEntry[],
    filenamePattern: body.filenamePattern?.trim() || `${template.name} - {${template.placeholders[0]?.name ?? "Date"}}`,
    outputFormat: (body.outputFormat as OutputFormat) ?? "docx",
    compressImages: body.compressImages ?? true,
    deliveryWebhookUrl: body.deliveryWebhookUrl,
    createdAt: now,
    updatedAt: now,
  };
  await mappingsDb.insert(mapping);
  res.status(201).json({ mapping, message: req.t("mapping.saved") });
});

mappingsRouter.put("/:id", async (req, res) => {
  const existing = await mappingsDb.get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: req.t("errors.mappingNotFound") });
    return;
  }
  const body = req.body as Partial<MappingRecord>;
  const updated = await mappingsDb.update(req.params.id, {
    ...body,
    id: existing.id,
    templateId: existing.templateId,
    updatedAt: new Date().toISOString(),
  });
  res.json({ mapping: updated, message: req.t("mapping.saved") });
});

mappingsRouter.delete("/:id", async (req, res) => {
  const ok = await mappingsDb.remove(req.params.id);
  if (!ok) {
    res.status(404).json({ error: req.t("errors.mappingNotFound") });
    return;
  }
  res.status(204).end();
});
