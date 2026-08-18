const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const message = isJson && data && typeof data === "object" && "error" in data ? String((data as any).error) : String(data);
    throw new ApiError(message || `Request failed with ${res.status}`, res.status);
  }
  return data as T;
}

export const api = {
  base: BASE,

  // Templates
  listTemplates: () => request<{ templates: Template[] }>("/templates"),
  getTemplate: (id: string) => request<{ template: Template }>(`/templates/${id}`),
  uploadTemplate: (file: File, name: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("name", name);
    return request<{ template: Template; message: string }>("/templates", { method: "POST", body: form });
  },
  deleteTemplate: (id: string) => request<void>(`/templates/${id}`, { method: "DELETE" }),

  // Lark
  larkStatus: () => request<{ configured: boolean }>("/lark/status"),
  larkTables: (appToken: string) => request<{ tables: LarkTable[] }>(`/lark/tables?appToken=${encodeURIComponent(appToken)}`),
  larkFields: (appToken: string, tableId: string) =>
    request<{ fields: LarkField[] }>(`/lark/fields?appToken=${encodeURIComponent(appToken)}&tableId=${encodeURIComponent(tableId)}`),
  larkRecords: (appToken: string, tableId: string) =>
    request<{ records: LarkRecordSummary[]; total: number }>(
      `/lark/records?appToken=${encodeURIComponent(appToken)}&tableId=${encodeURIComponent(tableId)}`
    ),

  // Mappings
  listMappings: (templateId?: string) =>
    request<{ mappings: Mapping[] }>(`/mappings${templateId ? `?templateId=${encodeURIComponent(templateId)}` : ""}`),
  suggestMapping: (templateId: string, appToken: string, tableId: string) =>
    request<{ suggestions: FieldMappingEntry[]; availableFields: (LarkField & { suggestedTag: string })[] }>(
      `/mappings/suggest/${templateId}?appToken=${encodeURIComponent(appToken)}&tableId=${encodeURIComponent(tableId)}`
    ),
  createMapping: (body: Partial<Mapping>) =>
    request<{ mapping: Mapping; message: string }>("/mappings", { method: "POST", body: JSON.stringify(body) }),
  updateMapping: (id: string, body: Partial<Mapping>) =>
    request<{ mapping: Mapping; message: string }>(`/mappings/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteMapping: (id: string) => request<void>(`/mappings/${id}`, { method: "DELETE" }),

  // Generation
  generate: (templateId: string, mappingId: string, recordIds: string[]) =>
    request<{ job: Job }>("/generate", { method: "POST", body: JSON.stringify({ templateId, mappingId, recordIds }) }),
  getJob: (id: string) => request<{ job: Job }>(`/jobs/${id}`),
  outputUrl: (id: string) => `${BASE}/outputs/${id}`,

  // Settings
  getSettings: () => request<SettingsResponse>("/settings"),
  regenerateApiKey: () => request<{ apiKey: string }>("/settings/regenerate-key", { method: "POST" }),
  setLanguage: (language: "en" | "vi") =>
    request<{ language: string }>("/settings/language", { method: "POST", body: JSON.stringify({ language }) }),
};

export interface Placeholder {
  name: string;
  kind: "field" | "loop" | "image" | "section" | "raw";
  raw: string;
}

export interface Template {
  id: string;
  name: string;
  originalFilename: string;
  fileId: string;
  placeholders: Placeholder[];
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface LarkTable {
  table_id: string;
  name: string;
}

export interface LarkField {
  fieldId: string;
  fieldName: string;
  type: number;
  typeLabel: string;
}

export interface LarkRecordSummary {
  recordId: string;
  label: string;
}

export type MappedFieldKind = "value" | "image" | "loop";
export type OutputFormat = "docx" | "pdf" | "both";

export interface FieldMappingEntry {
  tag: string;
  larkFieldId: string;
  larkFieldName: string;
  larkFieldType: number;
  kind: MappedFieldKind;
}

export interface Mapping {
  id: string;
  templateId: string;
  name: string;
  larkAppToken: string;
  larkTableId: string;
  outputAttachmentFieldId?: string;
  outputAttachmentFieldName?: string;
  fields: FieldMappingEntry[];
  filenamePattern: string;
  outputFormat: OutputFormat;
  compressImages: boolean;
  deliveryWebhookUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobResultItem {
  recordId: string;
  status: "success" | "error";
  fileName?: string;
  outputFileId?: string;
  pdfFileId?: string;
  larkFileToken?: string;
  error?: string;
  deliveryStatus?: "sent" | "failed" | "skipped";
  deliveryError?: string;
}

export interface Job {
  id: string;
  templateId: string;
  mappingId: string;
  source: "manual" | "webhook";
  status: "pending" | "running" | "completed" | "failed";
  total: number;
  completed: number;
  failed: number;
  results: JobResultItem[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsResponse {
  apiKey: string;
  language: "en" | "vi";
  larkConfigured: boolean;
  pdfConversionAvailable: boolean;
  webhookPath: string;
  configStoreMode: "lark" | "local";
}

export function subscribeJob(jobId: string, onUpdate: (job: Job) => void): () => void {
  const source = new EventSource(`${BASE}/jobs/${jobId}/stream`);
  source.onmessage = (evt) => {
    try {
      onUpdate(JSON.parse(evt.data));
    } catch {
      // ignore malformed frames
    }
  };
  return () => source.close();
}
