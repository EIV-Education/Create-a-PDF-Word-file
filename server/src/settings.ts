import { randomBytes } from "node:crypto";
import { settingsDb } from "./db.js";
import { config } from "./config.js";
import type { AppSettings } from "./models.js";

function generateApiKey(): string {
  return `ldg_${randomBytes(24).toString("hex")}`;
}

/**
 * Loads the singleton settings row, creating it on first run. The webhook
 * API key defaults to WEBHOOK_API_KEY from the environment if set, so
 * deployments can pin a stable key via config instead of a generated one.
 */
export async function getSettings(): Promise<AppSettings> {
  const existing = await settingsDb.get("singleton");
  if (existing) return existing;

  const created: AppSettings = {
    id: "singleton",
    apiKey: config.webhookApiKey || generateApiKey(),
    language: config.defaultLocale,
    updatedAt: new Date().toISOString(),
  };
  await settingsDb.insert(created);
  return created;
}

export async function regenerateApiKey(): Promise<AppSettings> {
  await getSettings();
  const updated = await settingsDb.update("singleton", {
    apiKey: generateApiKey(),
    updatedAt: new Date().toISOString(),
  });
  return updated!;
}

export async function setLanguage(language: "en" | "vi"): Promise<AppSettings> {
  await getSettings();
  const updated = await settingsDb.update("singleton", { language, updatedAt: new Date().toISOString() });
  return updated!;
}
