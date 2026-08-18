import { describe, expect, it } from "vitest";
import { suggestFieldMatches } from "../src/mapping/autoMatch.js";
import type { Placeholder } from "../src/template/placeholders.js";
import type { LarkField } from "../src/lark/client.js";

function field(fieldId: string, fieldName: string, type = 1): LarkField {
  return { field_id: fieldId, field_name: fieldName, type };
}

function placeholder(name: string, kind: Placeholder["kind"] = "field"): Placeholder {
  return { name, kind, raw: `{${name}}` };
}

describe("suggestFieldMatches", () => {
  it("matches an uppercase, underscore-joined Vietnamese tag to a differently-cased/spaced field name (regression: 'Mức lương'/'Địa chỉ liên hệ' were silently unmapped)", () => {
    const placeholders = [placeholder("MỨC_LƯƠNG"), placeholder("ĐỊA_CHỈ_LIÊN_HỆ")];
    const fields = [field("f1", "Mức lương"), field("f2", "Địa chỉ liên hệ")];

    const suggestions = suggestFieldMatches(placeholders, fields);

    expect(suggestions).toEqual([
      { tag: "MỨC_LƯƠNG", larkFieldId: "f1", larkFieldName: "Mức lương", larkFieldType: 1, kind: "value" },
      { tag: "ĐỊA_CHỈ_LIÊN_HỆ", larkFieldId: "f2", larkFieldName: "Địa chỉ liên hệ", larkFieldType: 1, kind: "value" },
    ]);
  });

  it("matches regardless of which side has diacritics/underscores/case", () => {
    const placeholders = [placeholder("ho_ten"), placeholder("Ngay Sinh")];
    const fields = [field("f1", "HỌ TÊN"), field("f2", "ngay_sinh", 5)];

    const suggestions = suggestFieldMatches(placeholders, fields);

    expect(suggestions.map((s) => s.larkFieldId)).toEqual(["f1", "f2"]);
  });

  it("leaves a tag unmatched when no field name is close enough", () => {
    const placeholders = [placeholder("Completely_Unrelated_Tag")];
    const fields = [field("f1", "Customer Name")];

    expect(suggestFieldMatches(placeholders, fields)).toEqual([]);
  });

  it("skips section (conditional) placeholders", () => {
    const placeholders = [placeholder("Has_Discount", "section")];
    const fields = [field("f1", "Has Discount", 7)];

    expect(suggestFieldMatches(placeholders, fields)).toEqual([]);
  });

  it("maps image/loop placeholder kinds through to the mapping entry's kind", () => {
    const placeholders = [placeholder("Photo", "image"), placeholder("Items", "loop")];
    const fields = [field("f1", "Photo", 17), field("f2", "Items", 18)];

    const suggestions = suggestFieldMatches(placeholders, fields);

    expect(suggestions.map((s) => s.kind)).toEqual(["image", "loop"]);
  });
});
