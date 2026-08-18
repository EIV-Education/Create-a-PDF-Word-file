import type { NextFunction, Request, Response } from "express";
import { getSettings } from "../settings.js";

/** Protects /api/webhook/* routes so only Lark Base Automation (or anyone
 * holding the generated key) can trigger document generation. */
export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const provided = req.header("x-api-key") ?? (typeof req.query.api_key === "string" ? req.query.api_key : undefined);
  const settings = await getSettings();
  if (!provided || provided !== settings.apiKey) {
    res.status(401).json({ error: req.t("errors.unauthorized") });
    return;
  }
  next();
}
