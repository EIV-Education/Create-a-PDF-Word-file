import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonCollection } from "../src/storage/jsonStore.js";

interface Item {
  id: string;
  name: string;
}

describe("JsonCollection", () => {
  let dir: string;
  let store: JsonCollection<Item>;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "jsonstore-test-"));
    store = new JsonCollection<Item>(dir, "items");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns an empty array before anything is written", async () => {
    expect(await store.all()).toEqual([]);
  });

  it("inserts and persists to disk", async () => {
    await store.insert({ id: "1", name: "A" });
    const fresh = new JsonCollection<Item>(dir, "items");
    expect(await fresh.all()).toEqual([{ id: "1", name: "A" }]);
  });

  it("updates an existing item by id", async () => {
    await store.insert({ id: "1", name: "A" });
    const updated = await store.update("1", { name: "B" });
    expect(updated).toEqual({ id: "1", name: "B" });
    expect(await store.get("1")).toEqual({ id: "1", name: "B" });
  });

  it("returns undefined when updating a missing id", async () => {
    expect(await store.update("nope", { name: "X" })).toBeUndefined();
  });

  it("removes an item", async () => {
    await store.insert({ id: "1", name: "A" });
    expect(await store.remove("1")).toBe(true);
    expect(await store.all()).toEqual([]);
    expect(await store.remove("1")).toBe(false);
  });

  it("finds items by predicate", async () => {
    await store.insert({ id: "1", name: "A" });
    await store.insert({ id: "2", name: "B" });
    expect(await store.find((i) => i.name === "B")).toEqual([{ id: "2", name: "B" }]);
  });

  it("serializes concurrent writes without dropping any", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.insert({ id: String(i), name: `item-${i}` }))
    );
    expect(await store.all()).toHaveLength(20);
  });
});
