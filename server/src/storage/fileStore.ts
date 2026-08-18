import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/** Flat binary blob storage under FILES_DIR, addressed by opaque id. */
export class FileStore {
  constructor(private subdir: string, private root: string = config.filesDir) {}

  private pathFor(id: string): string {
    return path.join(this.root, this.subdir, id);
  }

  async save(id: string, data: Buffer): Promise<string> {
    const p = this.pathFor(id);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
    return p;
  }

  async read(id: string): Promise<Buffer> {
    return fs.readFile(this.pathFor(id));
  }

  async remove(id: string): Promise<void> {
    await fs.rm(this.pathFor(id), { force: true });
  }

  async exists(id: string): Promise<boolean> {
    try {
      await fs.access(this.pathFor(id));
      return true;
    } catch {
      return false;
    }
  }
}

export const templateFiles = new FileStore("templates");
export const outputFiles = new FileStore("outputs");
