import { describe, expect, it } from "vitest";
import { slugifyFieldName, slugifyFieldNames } from "../src/utils/slugify.js";

describe("slugifyFieldName", () => {
  it("keeps already-safe names untouched", () => {
    expect(slugifyFieldName("Customer_Name")).toBe("Customer_Name");
  });

  it("replaces spaces and punctuation with underscores", () => {
    expect(slugifyFieldName("Customer Name!")).toBe("Customer_Name");
  });

  it("transliterates Vietnamese diacritics", () => {
    expect(slugifyFieldName("Tên khách hàng")).toBe("Ten_khach_hang");
    expect(slugifyFieldName("Đơn giá")).toBe("Don_gia");
  });

  it("prefixes names that start with a digit", () => {
    expect(slugifyFieldName("2026 Revenue")).toBe("_2026_Revenue");
  });

  it("falls back to a default for names with no ASCII letters", () => {
    expect(slugifyFieldName("😀")).toBe("Field");
  });
});

describe("slugifyFieldNames", () => {
  it("de-duplicates colliding slugs with numeric suffixes", () => {
    const result = slugifyFieldNames(["Customer Name", "Customer  Name!", "customer-name"]);
    expect([...result.values()]).toEqual(["Customer_Name", "Customer_Name_2", "customer_name"]);
  });
});
