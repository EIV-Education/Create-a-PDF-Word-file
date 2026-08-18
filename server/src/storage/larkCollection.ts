import { larkClient } from "../lark/client.js";
import type { Collection } from "./jsonStore.js";

const TEXT_FIELD = 1;

/** Lark text fields sometimes come back as a plain string, sometimes as a
 * list of rich-text segments (`[{ type: "text", text: "..." }]`) — normalize
 * either shape to a plain string. */
function extractText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw.map((seg: any) => (typeof seg === "string" ? seg : (seg?.text ?? ""))).join("");
  }
  if (raw && typeof raw === "object" && "text" in (raw as any)) return String((raw as any).text);
  return "";
}

interface Row<T> {
  recordId: string;
  item: T;
}

/**
 * `Collection<T>` implementation backed by a Lark Base table instead of a
 * local file: each item is stored as one record with `id`/`name` (for
 * human-readable browsing in the Base) and a `data` field holding the full
 * item as JSON. The table is found by name on first use, or created if it
 * doesn't exist yet — no manual setup required beyond granting the app
 * access to the Base (`LARK_CONFIG_APP_TOKEN`).
 *
 * This is intentionally simple (list-and-filter in memory, no indexing) —
 * fine for the handful of templates/mappings a document-automation setup
 * typically has; not meant to scale to a data store with thousands of rows.
 */
export class LarkCollection<T extends { id: string; name?: string }> implements Collection<T> {
  private tableIdPromise: Promise<string> | null = null;

  constructor(private appToken: string, private tableName: string) {}

  private tableId(): Promise<string> {
    if (!this.tableIdPromise) {
      this.tableIdPromise = this.resolveTableId().catch((err) => {
        // Don't cache a failed resolution - let the next call retry
        // (e.g. transient network error, or the app just got permission).
        this.tableIdPromise = null;
        throw err;
      });
    }
    return this.tableIdPromise;
  }

  private async resolveTableId(): Promise<string> {
    const tables = await larkClient.listTables(this.appToken);
    const existing = tables.find((t) => t.name === this.tableName);
    if (existing) return existing.table_id;
    return larkClient.createTable(this.appToken, this.tableName, [
      { field_name: "id", type: TEXT_FIELD },
      { field_name: "name", type: TEXT_FIELD },
      { field_name: "data", type: TEXT_FIELD },
    ]);
  }

  private async allRows(): Promise<Row<T>[]> {
    const tableId = await this.tableId();
    const records = await larkClient.listRecords(this.appToken, tableId);
    const rows: Row<T>[] = [];
    for (const r of records) {
      const raw = extractText(r.fields["data"]);
      if (!raw) continue;
      try {
        rows.push({ recordId: r.record_id, item: JSON.parse(raw) as T });
      } catch {
        // Skip a corrupt/partial row rather than failing the whole listing.
      }
    }
    return rows;
  }

  async all(): Promise<T[]> {
    return (await this.allRows()).map((r) => r.item);
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    return (await this.all()).filter(predicate);
  }

  async findOne(predicate: (item: T) => boolean): Promise<T | undefined> {
    return (await this.all()).find(predicate);
  }

  async get(id: string): Promise<T | undefined> {
    return (await this.all()).find((item) => item.id === id);
  }

  async insert(item: T): Promise<T> {
    const tableId = await this.tableId();
    await larkClient.createRecord(this.appToken, tableId, {
      id: item.id,
      name: item.name ?? "",
      data: JSON.stringify(item),
    });
    return item;
  }

  async update(id: string, patch: Partial<T>): Promise<T | undefined> {
    const rows = await this.allRows();
    const row = rows.find((r) => r.item.id === id);
    if (!row) return undefined;
    const next = { ...row.item, ...patch } as T;
    const tableId = await this.tableId();
    await larkClient.updateRecordField({
      appToken: this.appToken,
      tableId,
      recordId: row.recordId,
      fields: { name: next.name ?? "", data: JSON.stringify(next) },
    });
    return next;
  }

  async replace(id: string, next: T): Promise<T> {
    const rows = await this.allRows();
    const row = rows.find((r) => r.item.id === id);
    const tableId = await this.tableId();
    if (!row) {
      await larkClient.createRecord(this.appToken, tableId, {
        id,
        name: next.name ?? "",
        data: JSON.stringify(next),
      });
    } else {
      await larkClient.updateRecordField({
        appToken: this.appToken,
        tableId,
        recordId: row.recordId,
        fields: { name: next.name ?? "", data: JSON.stringify(next) },
      });
    }
    return next;
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.allRows();
    const row = rows.find((r) => r.item.id === id);
    if (!row) return false;
    const tableId = await this.tableId();
    await larkClient.deleteRecord(this.appToken, tableId, row.recordId);
    return true;
  }
}
