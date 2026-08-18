import { describe, expect, it } from "vitest";
import { normalizeFieldValue, fieldTypeLabel } from "../src/lark/fieldTypes.js";

describe("fieldTypeLabel", () => {
  it("maps known type codes", () => {
    expect(fieldTypeLabel(1)).toBe("text");
    expect(fieldTypeLabel(17)).toBe("attachment");
  });
  it("falls back for unknown codes", () => {
    expect(fieldTypeLabel(999)).toBe("unknown(999)");
  });
});

describe("normalizeFieldValue", () => {
  it("passes text through", () => {
    expect(normalizeFieldValue(1, "hello")).toEqual({ value: "hello", attachments: [] });
  });

  it("coerces numbers", () => {
    expect(normalizeFieldValue(2, "42").value).toBe(42);
  });

  it("returns a single attachment token and flags images by extension", () => {
    const { value, attachments } = normalizeFieldValue(17, [{ file_token: "tok1", name: "photo.jpg" }]);
    expect(value).toBe("tok1");
    expect(attachments).toEqual([{ fileToken: "tok1", name: "photo.jpg", isImage: true }]);
  });

  it("returns an array of tokens for multiple attachments and flags non-images", () => {
    const { value, attachments } = normalizeFieldValue(17, [
      { file_token: "a", name: "a.png" },
      { file_token: "b", name: "b.pdf" },
    ]);
    expect(value).toEqual(["a", "b"]);
    expect(attachments[1]).toEqual({ fileToken: "b", name: "b.pdf", isImage: false });
  });

  it("flattens multi_select to a string array", () => {
    expect(normalizeFieldValue(4, ["Red", "Blue"]).value).toEqual(["Red", "Blue"]);
  });

  it("unwraps single-user fields to a plain object", () => {
    const { value } = normalizeFieldValue(11, [{ name: "An", email: "an@x.com", id: "u1" }]);
    expect(value).toEqual({ name: "An", email: "an@x.com", id: "u1" });
  });

  it("unwraps lookup values", () => {
    const { value } = normalizeFieldValue(19, { type: 1, value: [{ text: "Foo" }, { text: "Bar" }] });
    expect(value).toEqual(["Foo", "Bar"]);
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeFieldValue(1, null).value).toBe("");
    expect(normalizeFieldValue(1, undefined).value).toBe("");
  });
});
