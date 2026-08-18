import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { buildMinimalDocx } from "./helpers/buildDocx.js";

vi.mock("../src/lark/client.js", () => ({
  larkClient: {
    isConfigured: vi.fn(() => true),
    listFields: vi.fn(async () => [
      { field_id: "fldpFB3Zlm", field_name: "MỨC LƯƠNG", type: 2 },
      { field_id: "fldHgH6ukJ", field_name: "HỌ TÊN", type: 1 },
    ]),
  },
}));

/**
 * Regression test for a real incident: GET /api/mappings/suggest/:id
 * returned `availableFields` shaped with Lark's raw snake_case keys
 * (field_id, field_name) instead of the camelCase shape
 * (fieldId, fieldName, typeLabel) the Mapping page's <select> options are
 * keyed by - so even though `suggestions` correctly matched every tag, the
 * dropdowns had no matching option value and silently showed
 * "not mapped" anyway.
 */
describe("GET /api/mappings/suggest/:templateId", () => {
  let dataDir: string;
  let filesDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "mappings-route-data-"));
    filesDir = await fs.mkdtemp(path.join(os.tmpdir(), "mappings-route-files-"));
    vi.resetModules();
    process.env.DATA_DIR = dataDir;
    process.env.FILES_DIR = filesDir;
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    await fs.rm(filesDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
    delete process.env.FILES_DIR;
  });

  it("returns availableFields in the same camelCase shape as GET /api/lark/fields", async () => {
    const { createApp } = await import("../src/index.js");
    const app = createApp();

    const docx = buildMinimalDocx(["{MỨC_LƯƠNG} - {HỌ_TÊN}"]);
    const uploadRes = await request(app).post("/api/templates").field("name", "Test").attach("file", docx, "test.docx");
    expect(uploadRes.status).toBe(201);
    const templateId = uploadRes.body.template.id;

    const res = await request(app).get(`/api/mappings/suggest/${templateId}`).query({ appToken: "app1", tableId: "tbl1" });

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "MỨC_LƯƠNG", larkFieldId: "fldpFB3Zlm" }),
        expect.objectContaining({ tag: "HỌ_TÊN", larkFieldId: "fldHgH6ukJ" }),
      ])
    );

    for (const field of res.body.availableFields) {
      expect(field).toHaveProperty("fieldId");
      expect(field).toHaveProperty("fieldName");
      expect(field).toHaveProperty("typeLabel");
      expect(field).not.toHaveProperty("field_id");
      expect(field).not.toHaveProperty("field_name");
    }
    expect(res.body.availableFields.map((f: any) => f.fieldId)).toEqual(
      expect.arrayContaining(["fldpFB3Zlm", "fldHgH6ukJ"])
    );
  });
});
