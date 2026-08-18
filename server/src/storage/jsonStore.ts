import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Minimal dependency-free JSON-file-backed collection store.
 *
 * This keeps the MVP free of native-module database dependencies (no
 * better-sqlite3 / postgres) so the server runs anywhere Node runs. Writes
 * are serialized per-collection with an in-memory queue so concurrent
 * requests never interleave a write. For real production scale, swap this
 * for Postgres/SQLite behind the same `Collection<T>` interface.
 */
export class JsonCollection<T extends { id: string }> {
  private filePath: string;
  private cache: T[] | null = null;
  private loadingPromise: Promise<T[]> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string, name: string) {
    this.filePath = path.join(dataDir, `${name}.json`);
  }

  private async ensureLoaded(): Promise<T[]> {
    if (this.cache) return this.cache;
    // Memoize the in-flight load so concurrent callers (e.g. a burst of
    // parallel inserts before anything has been read yet) await the same
    // read instead of each independently resetting `cache` to a fresh
    // array and silently dropping each other's writes.
    if (!this.loadingPromise) {
      this.loadingPromise = (async () => {
        try {
          const raw = await fs.readFile(this.filePath, "utf-8");
          return JSON.parse(raw) as T[];
        } catch (err: any) {
          if (err.code === "ENOENT") return [];
          throw err;
        }
      })();
    }
    this.cache = await this.loadingPromise;
    return this.cache;
  }

  private async persist(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(this.cache, null, 2), "utf-8");
    await fs.rename(tmpPath, this.filePath);
  }

  private enqueueWrite(): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => this.persist());
    return this.writeQueue;
  }

  async all(): Promise<T[]> {
    const items = await this.ensureLoaded();
    return [...items];
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    const items = await this.ensureLoaded();
    return items.filter(predicate);
  }

  async findOne(predicate: (item: T) => boolean): Promise<T | undefined> {
    const items = await this.ensureLoaded();
    return items.find(predicate);
  }

  async get(id: string): Promise<T | undefined> {
    const items = await this.ensureLoaded();
    return items.find((item) => item.id === id);
  }

  async insert(item: T): Promise<T> {
    const items = await this.ensureLoaded();
    items.push(item);
    await this.enqueueWrite();
    return item;
  }

  async update(id: string, patch: Partial<T>): Promise<T | undefined> {
    const items = await this.ensureLoaded();
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return undefined;
    items[idx] = { ...items[idx], ...patch } as T;
    await this.enqueueWrite();
    return items[idx];
  }

  async replace(id: string, next: T): Promise<T> {
    const items = await this.ensureLoaded();
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) {
      items.push(next);
    } else {
      items[idx] = next;
    }
    await this.enqueueWrite();
    return next;
  }

  async remove(id: string): Promise<boolean> {
    const items = await this.ensureLoaded();
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return false;
    items.splice(idx, 1);
    await this.enqueueWrite();
    return true;
  }
}
