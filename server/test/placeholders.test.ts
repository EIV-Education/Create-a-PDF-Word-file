import { describe, expect, it } from "vitest";
import { buildMinimalDocx } from "./helpers/buildDocx.js";
import { extractPlaceholders } from "../src/template/placeholders.js";

describe("extractPlaceholders", () => {
  it("categorizes fields, loops, images and sections", () => {
    const docx = buildMinimalDocx([
      "Dear {Customer_Name},",
      "{#Items}",
      "- {Item_Name}: {Item_Price}",
      "{/Items}",
      "{%Signature_Photo}",
      "{^Has_Discount}Discount applies{/Has_Discount}",
    ]);

    const placeholders = extractPlaceholders(docx);
    const byName = Object.fromEntries(placeholders.map((p) => [p.name, p.kind]));

    expect(byName["Customer_Name"]).toBe("field");
    expect(byName["Items"]).toBe("loop");
    expect(byName["Item_Name"]).toBe("field");
    expect(byName["Item_Price"]).toBe("field");
    expect(byName["Signature_Photo"]).toBe("image");
    expect(byName["Has_Discount"]).toBe("section");
  });

  it("de-duplicates repeated tags, keeping first-seen order", () => {
    const docx = buildMinimalDocx(["{Name} and {Name} again, then {Age}"]);
    const placeholders = extractPlaceholders(docx);
    expect(placeholders.map((p) => p.name)).toEqual(["Name", "Age"]);
  });

  it("ignores the loop-local '.' token", () => {
    const docx = buildMinimalDocx(["{#Photos}{%.}{/Photos}"]);
    const placeholders = extractPlaceholders(docx);
    expect(placeholders.map((p) => p.name)).toEqual(["Photos"]);
  });

  it("returns an empty list for a template with no placeholders", () => {
    const docx = buildMinimalDocx(["Just plain text."]);
    expect(extractPlaceholders(docx)).toEqual([]);
  });
});
