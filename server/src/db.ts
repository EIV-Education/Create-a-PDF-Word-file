import { Collection, JsonCollection } from "./storage/jsonStore.js";
import { LarkCollection } from "./storage/larkCollection.js";
import { config } from "./config.js";
import { AppSettings, JobRecord, MappingRecord, TemplateRecord } from "./models.js";

export interface OutputFileMeta {
  id: string;
  fileName: string;
  contentType: string;
  createdAt: string;
}

/**
 * Templates and field mappings are the app's own "config" — small, and
 * worth surviving a redeploy/restart even on hosts with no persistent
 * disk. When LARK_CONFIG_APP_TOKEN is set, they're stored as records in a
 * Lark Base instead of local JSON files (see storage/larkCollection.ts).
 *
 * Jobs, output-file metadata and settings stay local/JSON — they're either
 * short-lived by design (jobs, output files — see jobs/cleanup.ts) or
 * trivially re-derived (settings; the webhook API key itself should be
 * pinned via the WEBHOOK_API_KEY env var if you want it stable across
 * restarts too).
 */
export const configStoreMode: "lark" | "local" = config.lark.configAppToken ? "lark" : "local";

export const templatesDb: Collection<TemplateRecord> =
  configStoreMode === "lark"
    ? new LarkCollection<TemplateRecord>(config.lark.configAppToken, "DocGen_Templates")
    : new JsonCollection<TemplateRecord>(config.dataDir, "templates");

export const mappingsDb: Collection<MappingRecord> =
  configStoreMode === "lark"
    ? new LarkCollection<MappingRecord>(config.lark.configAppToken, "DocGen_Mappings")
    : new JsonCollection<MappingRecord>(config.dataDir, "mappings");

export const jobsDb = new JsonCollection<JobRecord>(config.dataDir, "jobs");
export const settingsDb = new JsonCollection<AppSettings>(config.dataDir, "settings");
export const outputFilesMetaDb = new JsonCollection<OutputFileMeta>(config.dataDir, "output-files-meta");
