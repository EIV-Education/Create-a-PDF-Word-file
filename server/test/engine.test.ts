import { describe, expect, it } from "vitest";
import sharp from "sharp";
import PizZip from "pizzip";
import { buildMinimalDocx, readDocxText } from "./helpers/buildDocx.js";
import { prepareImageAsset, renderDocx, TemplateRenderError } from "../src/template/engine.js";

describe("renderDocx", () => {
  it("substitutes plain field tags", () => {
    const docx = buildMinimalDocx(["Dear {Customer_Name}, your total is {Total}."]);
    const out = renderDocx(docx, { data: { Customer_Name: "Nguyen Van A", Total: 100 } });
    expect(readDocxText(out)).toBe("Dear Nguyen Van A, your total is 100.");
  });

  it("expands loop sections over arrays", () => {
    const docx = buildMinimalDocx(["{#Items}{Item_Name}={Item_Price};{/Items}"]);
    const out = renderDocx(docx, {
      data: {
        Items: [
          { Item_Name: "Pen", Item_Price: 10 },
          { Item_Name: "Book", Item_Price: 20 },
        ],
      },
    });
    expect(readDocxText(out)).toBe("Pen=10;Book=20;");
  });

  it("substitutes raw Vietnamese field names with diacritics, uppercase and underscores (regression: production failure with {SỐ_HĐLĐ}, {HỌ_TÊN}, ...)", () => {
    const docx = buildMinimalDocx([
      "Số HĐLĐ: {SỐ_HĐLĐ}. Họ tên: {HỌ_TÊN}. Ngày sinh: {Ngày_Sinh}. Địa chỉ: {Địa_chỉ_thường_trú}.",
    ]);
    const out = renderDocx(docx, {
      data: {
        SỐ_HĐLĐ: "001/2026",
        HỌ_TÊN: "Nguyễn Văn A",
        Ngày_Sinh: "01/01/1990",
        Địa_chỉ_thường_trú: "Hà Nội",
      },
    });
    expect(readDocxText(out)).toBe(
      "Số HĐLĐ: 001/2026. Họ tên: Nguyễn Văn A. Ngày sinh: 01/01/1990. Địa chỉ: Hà Nội."
    );
  });

  it("substitutes a plain tag containing spaces, exactly as a raw (non-slugified) field name", () => {
    const docx = buildMinimalDocx(["{Tên khách hàng} - {Số điện thoại}"]);
    const out = renderDocx(docx, { data: { "Tên khách hàng": "Công ty ABC", "Số điện thoại": "0900000000" } });
    expect(readDocxText(out)).toBe("Công ty ABC - 0900000000");
  });

  it("supports dot-notation nested fields via the angular-expressions parser", () => {
    const docx = buildMinimalDocx(["Contact: {Customer.Name} ({Customer.Email})"]);
    const out = renderDocx(docx, { data: { Customer: { Name: "A Corp", Email: "a@corp.com" } } });
    expect(readDocxText(out)).toBe("Contact: A Corp (a@corp.com)");
  });

  it("falls back to a literal lookup when a tag merely looks like an expression but isn't valid syntax", () => {
    const docx = buildMinimalDocx(["Giá: {Giá (VNĐ)}"]);
    const out = renderDocx(docx, { data: { "Giá (VNĐ)": "150.000" } });
    expect(readDocxText(out)).toBe("Giá: 150.000");
  });

  it("renders empty string for missing tags instead of throwing", () => {
    const docx = buildMinimalDocx(["Value: [{Missing}]"]);
    const out = renderDocx(docx, { data: {} });
    expect(readDocxText(out)).toBe("Value: []");
  });

  it("throws a TemplateRenderError with details for a malformed template", () => {
    // Unclosed loop tag.
    const docx = buildMinimalDocx(["{#Items}{Name}"]);
    expect(() => renderDocx(docx, { data: { Items: [] } })).toThrow(TemplateRenderError);
  });

  it("embeds an image for a {%tag} placeholder", async () => {
    const pngBuffer = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const asset = await prepareImageAsset(pngBuffer);

    const docx = buildMinimalDocx(["Photo: {%Photo}"]);
    const out = renderDocx(docx, {
      data: { Photo: "file-token-123" },
      images: new Map([["file-token-123", asset]]),
    });

    const zip = new PizZip(out);
    const mediaFiles = Object.keys(zip.files).filter((n) => n.startsWith("word/media/"));
    expect(mediaFiles.length).toBeGreaterThan(0);
  });
});
