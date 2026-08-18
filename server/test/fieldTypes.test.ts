import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  it("passes a plain string through for a text field", () => {
    expect(normalizeFieldValue(1, "hello")).toEqual({ value: "hello", attachments: [] });
  });

  it("extracts text from Lark's actual rich-text-segment shape for text fields (regression: was rendering raw JSON)", () => {
    const { value } = normalizeFieldValue(1, [{ text: "PHẠM HỒNG SƠN", type: "text" }]);
    expect(value).toBe("PHẠM HỒNG SƠN");
  });

  it("concatenates multiple rich-text segments (e.g. mixed formatting/mentions)", () => {
    const { value } = normalizeFieldValue(1, [
      { text: "Hello ", type: "text" },
      { text: "World", type: "text" },
    ]);
    expect(value).toBe("Hello World");
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

  it("unwraps a lookup over a text field (nested rich-text segments)", () => {
    const { value } = normalizeFieldValue(19, {
      type: 1,
      value: [[{ text: "Foo", type: "text" }], [{ text: "Bar", type: "text" }]],
    });
    expect(value).toEqual(["Foo", "Bar"]);
  });

  it("preserves numbers from a numeric formula result", () => {
    const { value } = normalizeFieldValue(20, { type: 2, value: [42] });
    expect(value).toEqual([42]);
  });

  it("extracts text for an unlisted/unknown field type via the same rich-text fallback", () => {
    const { value } = normalizeFieldValue(13, [{ text: "0900000000", type: "text" }]);
    expect(value).toBe("0900000000");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeFieldValue(1, null).value).toBe("");
    expect(normalizeFieldValue(1, undefined).value).toBe("");
  });

  describe("date formatting is timezone-independent (regression: dates rendered one day early)", () => {
    const originalTz = process.env.TZ;

    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it("formats a date field's UTC-midnight timestamp correctly regardless of the server's local timezone", () => {
      // Lark encodes a date-only field as UTC midnight of the selected
      // day. Production symptom: on a server whose local timezone isn't
      // UTC, every date rendered one day early (06/07/1994 -> 05/07/1994)
      // because reading UTC-midnight-of-the-6th via *local* getters lands
      // on the evening of the 5th in any negative-offset timezone.
      const ms = Date.UTC(1994, 6, 6, 0, 0, 0); // 06/07/1994

      for (const tz of ["UTC", "America/Los_Angeles", "Asia/Ho_Chi_Minh", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        expect(normalizeFieldValue(5, ms).value, `with TZ=${tz}`).toBe("06/07/1994");
      }
    });
  });
});
