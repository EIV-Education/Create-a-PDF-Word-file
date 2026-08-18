import { JsonCollection } from "./storage/jsonStore.js";
import { config } from "./config.js";
import { AppSettings, JobRecord, MappingRecord, TemplateRecord } from "./models.js";

export interface OutputFileMeta {
  id: string;
  fileName: string;
  contentType: string;
  createdAt: string;
}

export const templatesDb = new JsonCollection<TemplateRecord>(config.dataDir, "templates");
export const mappingsDb = new JsonCollection<MappingRecord>(config.dataDir, "mappings");
export const jobsDb = new JsonCollection<JobRecord>(config.dataDir, "jobs");
export const settingsDb = new JsonCollection<AppSettings>(config.dataDir, "settings");
export const outputFilesMetaDb = new JsonCollection<OutputFileMeta>(config.dataDir, "output-files-meta");
