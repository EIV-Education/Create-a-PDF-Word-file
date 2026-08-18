import axios, { AxiosInstance } from "axios";
import { config } from "../config.js";

/**
 * Thin wrapper around the Lark/Feishu Open API (Bitable = "Lark Base").
 * Docs: https://open.larksuite.com/document/server-docs/docs/bitable-v1/bitable-overview
 *
 * Handles tenant_access_token caching/refresh and exposes the handful of
 * endpoints this tool needs: list fields, list/get records, download an
 * attachment, upload a file, and patch a record's attachment field.
 */

export interface LarkField {
  field_id: string;
  field_name: string;
  type: number;
  ui_type?: string;
  property?: Record<string, unknown>;
}

export interface LarkRecord {
  record_id: string;
  fields: Record<string, unknown>;
}

export interface LarkAttachmentValue {
  file_token: string;
  name: string;
  size?: number;
  type?: string;
  url?: string;
}

class TokenCache {
  private token: string | null = null;
  private expiresAt = 0;

  get(): string | null {
    if (this.token && Date.now() < this.expiresAt) return this.token;
    return null;
  }

  set(token: string, expiresInSeconds: number): void {
    this.token = token;
    // Refresh a little early to avoid races right at expiry.
    this.expiresAt = Date.now() + Math.max(0, expiresInSeconds - 60) * 1000;
  }
}

export class LarkNotConfiguredError extends Error {
  constructor() {
    super("Lark app credentials are not configured");
    this.name = "LarkNotConfiguredError";
  }
}

export class LarkClient {
  private http: AxiosInstance;
  private tokenCache = new TokenCache();

  constructor(
    private appId: string = config.lark.appId,
    private appSecret: string = config.lark.appSecret,
    private domain: string = config.lark.domain
  ) {
    this.http = axios.create({ baseURL: this.domain, timeout: 30_000 });
  }

  isConfigured(): boolean {
    return Boolean(this.appId && this.appSecret);
  }

  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) throw new LarkNotConfiguredError();
    const cached = this.tokenCache.get();
    if (cached) return cached;

    const { data } = await this.http.post("/open-apis/auth/v3/tenant_access_token/internal", {
      app_id: this.appId,
      app_secret: this.appSecret,
    });
    if (data.code !== 0) {
      throw new Error(`Failed to obtain Lark tenant_access_token: ${data.msg} (code ${data.code})`);
    }
    this.tokenCache.set(data.tenant_access_token, data.expire);
    return data.tenant_access_token;
  }

  private async authedHeaders(extra?: Record<string, string>) {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  async listFields(appToken: string, tableId: string): Promise<LarkField[]> {
    const headers = await this.authedHeaders();
    const fields: LarkField[] = [];
    let pageToken: string | undefined;
    do {
      const { data } = await this.http.get(
        `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
        { headers, params: { page_size: 100, page_token: pageToken } }
      );
      if (data.code !== 0) throw new Error(`listFields failed: ${data.msg}`);
      fields.push(...(data.data.items ?? []));
      pageToken = data.data.has_more ? data.data.page_token : undefined;
    } while (pageToken);
    return fields;
  }

  async listRecords(
    appToken: string,
    tableId: string,
    opts: { recordIds?: string[]; pageSize?: number } = {}
  ): Promise<LarkRecord[]> {
    const headers = await this.authedHeaders({ "Content-Type": "application/json" });
    const records: LarkRecord[] = [];

    if (opts.recordIds && opts.recordIds.length > 0) {
      // Batch-get is the efficient path when the caller already knows which
      // rows to render (e.g. a webhook fired for one specific record).
      const chunkSize = 100;
      for (let i = 0; i < opts.recordIds.length; i += chunkSize) {
        const chunk = opts.recordIds.slice(i, i + chunkSize);
        const { data } = await this.http.post(
          `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_get`,
          { record_ids: chunk },
          { headers }
        );
        if (data.code !== 0) throw new Error(`batch_get records failed: ${data.msg}`);
        records.push(...(data.data.records ?? []));
      }
      return records;
    }

    let pageToken: string | undefined;
    do {
      const { data } = await this.http.get(
        `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
        { headers, params: { page_size: opts.pageSize ?? 100, page_token: pageToken } }
      );
      if (data.code !== 0) throw new Error(`listRecords failed: ${data.msg}`);
      records.push(...(data.data.items ?? []));
      pageToken = data.data.has_more ? data.data.page_token : undefined;
    } while (pageToken);
    return records;
  }

  async downloadAttachment(fileToken: string, extra?: { appToken?: string }): Promise<Buffer> {
    const headers = await this.authedHeaders();
    // Bitable attachments are downloaded via the drive media endpoint.
    const { data } = await this.http.get(`/open-apis/drive/v1/medias/${fileToken}/download`, {
      headers,
      responseType: "arraybuffer",
      params: extra?.appToken ? { extra: JSON.stringify({ bitablePerm: { tableId: extra.appToken } }) } : undefined,
    });
    return Buffer.from(data);
  }

  /** Uploads a generated file so it can be attached to a Bitable attachment field. */
  async uploadMedia(params: {
    appToken: string;
    tableId: string;
    fileName: string;
    fileContent: Buffer;
  }): Promise<string> {
    const headers = await this.authedHeaders();
    const form = new FormData();
    form.append("file_name", params.fileName);
    form.append("parent_type", "bitable_file");
    form.append("parent_node", params.appToken);
    form.append("size", String(params.fileContent.length));
    form.append("file", new Blob([params.fileContent]), params.fileName);

    const { data } = await this.http.post("/open-apis/drive/v1/medias/upload_all", form, { headers });
    if (data.code !== 0) throw new Error(`uploadMedia failed: ${data.msg}`);
    return data.data.file_token as string;
  }

  async updateRecordField(params: {
    appToken: string;
    tableId: string;
    recordId: string;
    fields: Record<string, unknown>;
  }): Promise<void> {
    const headers = await this.authedHeaders({ "Content-Type": "application/json" });
    const { data } = await this.http.put(
      `/open-apis/bitable/v1/apps/${params.appToken}/tables/${params.tableId}/records/${params.recordId}`,
      { fields: params.fields },
      { headers }
    );
    if (data.code !== 0) throw new Error(`updateRecordField failed: ${data.msg}`);
  }

  async listTables(appToken: string): Promise<Array<{ table_id: string; name: string }>> {
    const headers = await this.authedHeaders();
    const tables: Array<{ table_id: string; name: string }> = [];
    let pageToken: string | undefined;
    do {
      const { data } = await this.http.get(`/open-apis/bitable/v1/apps/${appToken}/tables`, {
        headers,
        params: { page_size: 100, page_token: pageToken },
      });
      if (data.code !== 0) throw new Error(`listTables failed: ${data.msg}`);
      tables.push(...(data.data.items ?? []));
      pageToken = data.data.has_more ? data.data.page_token : undefined;
    } while (pageToken);
    return tables;
  }
}

export const larkClient = new LarkClient();
