import { Router } from "express";
import { getSettings, regenerateApiKey, setLanguage } from "../settings.js";
import { larkClient } from "../lark/client.js";
import { isPdfConversionAvailable } from "../pdf/convert.js";

export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res) => {
  const settings = await getSettings();
  const [larkConfigured, pdfAvailable] = await Promise.all([
    Promise.resolve(larkClient.isConfigured()),
    isPdfConversionAvailable(),
  ]);
  res.json({
    apiKey: settings.apiKey,
    language: settings.language,
    larkConfigured,
    pdfConversionAvailable: pdfAvailable,
    webhookPath: "/api/webhook/generate",
  });
});

settingsRouter.post("/regenerate-key", async (_req, res) => {
  const settings = await regenerateApiKey();
  res.json({ apiKey: settings.apiKey });
});

settingsRouter.post("/language", async (req, res) => {
  const { language } = req.body as { language?: "en" | "vi" };
  if (language !== "en" && language !== "vi") {
    res.status(400).json({ error: "language must be 'en' or 'vi'" });
    return;
  }
  const settings = await setLanguage(language);
  res.json({ language: settings.language });
});
