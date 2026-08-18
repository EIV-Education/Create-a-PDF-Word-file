import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, "..");

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",

  /** Root directory for the tiny JSON-file datastore (see storage/jsonStore.ts). */
  dataDir: process.env.DATA_DIR ?? path.join(SERVER_ROOT, "data"),
  /** Root directory for uploaded templates + generated documents. */
  filesDir: process.env.FILES_DIR ?? path.join(SERVER_ROOT, "storage-files"),

  /** Static API key clients must send as `X-API-Key` for /api/webhook/* calls. */
  webhookApiKey: process.env.WEBHOOK_API_KEY ?? "",

  lark: {
    // "Lark" (global) vs "Feishu" (China) use different API hosts.
    domain: process.env.LARK_DOMAIN ?? "https://open.larksuite.com",
    appId: process.env.LARK_APP_ID ?? "",
    appSecret: process.env.LARK_APP_SECRET ?? "",
    // App Token of a Base your Lark app can write to, used to store the
    // app's own config (uploaded templates + field mappings) as Base
    // records instead of on local disk. When unset, falls back to the
    // local JSON-file store (server/src/storage/jsonStore.ts).
    configAppToken: process.env.LARK_CONFIG_APP_TOKEN ?? "",
  },

  outputs: {
    // Generated documents are meant to land in Lark's attachment field
    // (the permanent copy) — the server only keeps its own copy around
    // briefly, to power the "download" link right after generation.
    // A background sweep deletes anything older than this.
    ttlHours: Number(process.env.OUTPUT_FILE_TTL_HOURS ?? 24),
  },

  pdf: {
    // Path/command used to invoke LibreOffice headless for docx -> pdf conversion.
    sofficeBin: process.env.SOFFICE_BIN ?? "soffice",
    timeoutMs: Number(process.env.PDF_CONVERT_TIMEOUT_MS ?? 60_000),
  },

  images: {
    compressionEnabledByDefault: bool(process.env.IMAGE_COMPRESSION_DEFAULT, true),
    // Images wider/taller than this (px) get downscaled during compression.
    maxDimension: Number(process.env.IMAGE_MAX_DIMENSION ?? 1600),
    // JPEG/WebP quality (1-100) applied when re-encoding compressed images.
    quality: Number(process.env.IMAGE_QUALITY ?? 78),
  },

  cors: {
    origin: process.env.CORS_ORIGIN ?? "*",
  },

  defaultLocale: (process.env.DEFAULT_LOCALE as "en" | "vi") ?? "en",

  // Lark date-only fields are anchored to midnight in the Base/tenant's
  // own timezone (confirmed empirically: a field showing "07/07/1994" in
  // the UI returns the epoch for 1994-07-06T17:00:00Z, i.e. midnight
  // Asia/Ho_Chi_Minh, UTC+7) - NOT UTC midnight. Reading it back with the
  // server's local timezone (or UTC) getters is only correct by
  // coincidence if the server happens to run in the same timezone as the
  // Base, so it must be converted explicitly. Override if a mapping's
  // Base is configured for a different timezone.
  larkTimezone: process.env.LARK_TIMEZONE ?? "Asia/Ho_Chi_Minh",
};

export type AppConfig = typeof config;
