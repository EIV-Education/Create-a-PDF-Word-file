import { Router, type Request, type Response } from "express";
import { larkClient, LarkNotConfiguredError } from "../lark/client.js";
import { fieldTypeLabel } from "../lark/fieldTypes.js";

export const larkRouter = Router();

larkRouter.get("/status", (req, res) => {
  res.json({ configured: larkClient.isConfigured() });
});

larkRouter.get("/tables", async (req, res) => {
  const appToken = String(req.query.appToken ?? "");
  if (!appToken) {
    res.status(400).json({ error: "Missing appToken" });
    return;
  }
  try {
    const tables = await larkClient.listTables(appToken);
    res.json({ tables });
  } catch (err) {
    handleLarkError(err, req, res);
  }
});

larkRouter.get("/fields", async (req, res) => {
  const appToken = String(req.query.appToken ?? "");
  const tableId = String(req.query.tableId ?? "");
  if (!appToken || !tableId) {
    res.status(400).json({ error: "Missing appToken or tableId" });
    return;
  }
  try {
    const fields = await larkClient.listFields(appToken, tableId);
    res.json({
      fields: fields.map((f) => ({
        fieldId: f.field_id,
        fieldName: f.field_name,
        type: f.type,
        typeLabel: fieldTypeLabel(f.type),
      })),
    });
  } catch (err) {
    handleLarkError(err, req, res);
  }
});

larkRouter.get("/records", async (req, res) => {
  const appToken = String(req.query.appToken ?? "");
  const tableId = String(req.query.tableId ?? "");
  if (!appToken || !tableId) {
    res.status(400).json({ error: "Missing appToken or tableId" });
    return;
  }
  try {
    const [records, fields] = await Promise.all([
      larkClient.listRecords(appToken, tableId),
      larkClient.listFields(appToken, tableId),
    ]);
    // Prefer a text-ish field for the row label so the Generate page's
    // record picker shows something human-readable instead of raw ids.
    const labelField = fields.find((f) => f.type === 1) ?? fields[0];
    const items = records.map((r) => {
      const raw = labelField ? r.fields[labelField.field_name] : undefined;
      const label = summarizeForLabel(raw) || r.record_id;
      return { recordId: r.record_id, label };
    });
    res.json({ records: items, total: items.length });
  } catch (err) {
    handleLarkError(err, req, res);
  }
});

function summarizeForLabel(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(summarizeForLabel).filter(Boolean).join(", ");
  if (typeof value === "object" && "text" in (value as any)) return String((value as any).text);
  return String(value);
}

function handleLarkError(err: unknown, req: Request, res: Response) {
  if (err instanceof LarkNotConfiguredError) {
    res.status(503).json({ error: req.t("errors.larkNotConfigured") });
    return;
  }
  res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
}
