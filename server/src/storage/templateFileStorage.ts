import { randomUUID } from "node:crypto";
import { larkClient } from "../lark/client.js";
import { config } from "../config.js";
import { templateFiles } from "./fileStore.js";

/** Where the uploaded .docx template *bytes* live — separate from the
 * template's metadata row (name, placeholders, ...) in templatesDb. */
export interface TemplateFileStorage {
  save(data: Buffer, fileName: string): Promise<string>;
  read(id: string): Promise<Buffer>;
  remove(id: string): Promise<void>;
}

class LocalTemplateFileStorage implements TemplateFileStorage {
  async save(data: Buffer, _fileName: string): Promise<string> {
    const id = randomUUID();
    await templateFiles.save(id, data);
    return id;
  }
  async read(id: string): Promise<Buffer> {
    return templateFiles.read(id);
  }
  async remove(id: string): Promise<void> {
    await templateFiles.remove(id);
  }
}

/** Stores the template file as a Lark Drive file (uploadMedia doesn't
 * actually need a specific table — parent_node is the Base's app token). */
class LarkTemplateFileStorage implements TemplateFileStorage {
  constructor(private appToken: string) {}

  async save(data: Buffer, fileName: string): Promise<string> {
    return larkClient.uploadMedia({ appToken: this.appToken, tableId: "", fileName, fileContent: data });
  }
  async read(fileToken: string): Promise<Buffer> {
    return larkClient.downloadAttachment(fileToken);
  }
  async remove(fileToken: string): Promise<void> {
    // Best-effort: a template's metadata row is still deleted even if this
    // fails (e.g. already gone, or a transient API error).
    await larkClient.deleteMedia(fileToken).catch((err) => {
      console.error(`Failed to delete Lark file ${fileToken}:`, err);
    });
  }
}

export const templateFileStorage: TemplateFileStorage = config.lark.configAppToken
  ? new LarkTemplateFileStorage(config.lark.configAppToken)
  : new LocalTemplateFileStorage();
