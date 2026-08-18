import { Placeholder } from "./template/placeholders.js";

export interface TemplateRecord {
  id: string;
  name: string;
  originalFilename: string;
  /** File id inside storage/fileStore.ts's `templates` store. */
  fileId: string;
  placeholders: Placeholder[];
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export type MappedFieldKind = "value" | "image" | "loop";

export interface FieldMappingEntry {
  /** The slugified tag used in the template, e.g. "Customer_Name". */
  tag: string;
  larkFieldId: string;
  larkFieldName: string;
  larkFieldType: number;
  kind: MappedFieldKind;
}

export type OutputFormat = "docx" | "pdf" | "both";

export interface MappingRecord {
  id: string;
  templateId: string;
  name: string;
  larkAppToken: string;
  larkTableId: string;
  /** Optional: attachment field on the source table to write generated files back into. */
  outputAttachmentFieldId?: string;
  outputAttachmentFieldName?: string;
  fields: FieldMappingEntry[];
  filenamePattern: string;
  outputFormat: OutputFormat;
  compressImages: boolean;
  /** Optional: POST each generated file to an external URL after creation. */
  deliveryWebhookUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type JobStatus = "pending" | "running" | "completed" | "failed";
export type JobResultStatus = "success" | "error";

export interface JobResultItem {
  recordId: string;
  status: JobResultStatus;
  fileName?: string;
  outputFileId?: string;
  pdfFileId?: string;
  larkFileToken?: string;
  error?: string;
  deliveryStatus?: "sent" | "failed" | "skipped";
  deliveryError?: string;
}

export interface JobRecord {
  id: string;
  templateId: string;
  mappingId: string;
  source: "manual" | "webhook";
  status: JobStatus;
  total: number;
  completed: number;
  failed: number;
  results: JobResultItem[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  id: "singleton";
  apiKey: string;
  language: "en" | "vi";
  updatedAt: string;
}
