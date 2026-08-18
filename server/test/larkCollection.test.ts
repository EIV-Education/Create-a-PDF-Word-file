import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  tables: [] as Array<{ table_id: string; name: string }>,
  records: new Map<string, Record<string, unknown>>(),
  nextRecordId: 1,
};

function resetState() {
  state.tables = [];
  state.records = new Map();
  state.nextRecordId = 1;
}

vi.mock("../src/lark/client.js", () => ({
  larkClient: {
    listTables: vi.fn(async (_appToken: string) => state.tables),
    createTable: vi.fn(async (_appToken: string, name: string) => {
      const table_id = `tbl_${name}`;
      state.tables.push({ table_id, name });
      return table_id;
    }),
    listRecords: vi.fn(async (_appToken: string, _tableId: string) =>
      [...state.records.entries()].map(([record_id, fields]) => ({ record_id, fields }))
    ),
    createRecord: vi.fn(async (_appToken: string, _tableId: string, fields: Record<string, unknown>) => {
      const record_id = `rec_${state.nextRecordId++}`;
      state.records.set(record_id, fields);
      return record_id;
    }),
    updateRecordField: vi.fn(async (params: { recordId: string; fields: Record<string, unknown> }) => {
      const existing = state.records.get(params.recordId) ?? {};
      state.records.set(params.recordId, { ...existing, ...params.fields });
    }),
    deleteRecord: vi.fn(async (_appToken: string, _tableId: string, recordId: string) => {
      state.records.delete(recordId);
    }),
  },
}));

interface Item {
  id: string;
  name: string;
  count: number;
}

describe("LarkCollection", () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  it("creates the table on first use and reuses it afterwards", async () => {
    const { LarkCollection } = await import("../src/storage/larkCollection.js");
    const { larkClient } = await import("../src/lark/client.js");
    const col = new LarkCollection<Item>("app_token", "DocGen_Templates");

    await col.all();
    await col.all();

    expect(larkClient.createTable).toHaveBeenCalledTimes(1);
    expect(state.tables).toEqual([{ table_id: "tbl_DocGen_Templates", name: "DocGen_Templates" }]);
  });

  it("finds an existing table by name instead of creating a new one", async () => {
    state.tables.push({ table_id: "tbl_existing", name: "DocGen_Templates" });
    const { LarkCollection } = await import("../src/storage/larkCollection.js");
    const { larkClient } = await import("../src/lark/client.js");
    const col = new LarkCollection<Item>("app_token", "DocGen_Templates");

    await col.all();

    expect(larkClient.createTable).not.toHaveBeenCalled();
  });

  it("round-trips insert / get / all", async () => {
    const { LarkCollection } = await import("../src/storage/larkCollection.js");
    const col = new LarkCollection<Item>("app_token", "DocGen_Mappings");

    await col.insert({ id: "a", name: "Alpha", count: 1 });
    await col.insert({ id: "b", name: "Beta", count: 2 });

    expect(await col.all()).toEqual(
      expect.arrayContaining([
        { id: "a", name: "Alpha", count: 1 },
        { id: "b", name: "Beta", count: 2 },
      ])
    );
    expect(await col.get("a")).toEqual({ id: "a", name: "Alpha", count: 1 });
    expect(await col.get("missing")).toBeUndefined();
  });

  it("update() patches an existing item and returns undefined for a missing id", async () => {
    const { LarkCollection } = await import("../src/storage/larkCollection.js");
    const col = new LarkCollection<Item>("app_token", "DocGen_Mappings");
    await col.insert({ id: "a", name: "Alpha", count: 1 });

    const updated = await col.update("a", { count: 99 });
    expect(updated).toEqual({ id: "a", name: "Alpha", count: 99 });
    expect(await col.get("a")).toEqual({ id: "a", name: "Alpha", count: 99 });

    expect(await col.update("missing", { count: 1 })).toBeUndefined();
  });

  it("remove() deletes an item and reports whether it existed", async () => {
    const { LarkCollection } = await import("../src/storage/larkCollection.js");
    const col = new LarkCollection<Item>("app_token", "DocGen_Mappings");
    await col.insert({ id: "a", name: "Alpha", count: 1 });

    expect(await col.remove("a")).toBe(true);
    expect(await col.all()).toEqual([]);
    expect(await col.remove("a")).toBe(false);
  });

  it("skips a corrupt row instead of throwing", async () => {
    const { LarkCollection } = await import("../src/storage/larkCollection.js");
    const col = new LarkCollection<Item>("app_token", "DocGen_Mappings");
    await col.insert({ id: "a", name: "Alpha", count: 1 });
    // Simulate a hand-edited/corrupt row directly in the Base.
    state.records.set("rec_corrupt", { id: "x", name: "x", data: "{not json" });

    expect(await col.all()).toEqual([{ id: "a", name: "Alpha", count: 1 }]);
  });
});
