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

  it("supports dot-notation nested fields via the angular-expressions parser", () => {
    const docx = buildMinimalDocx(["Contact: {Customer.Name} ({Customer.Email})"]);
    const out = renderDocx(docx, { data: { Customer: { Name: "A Corp", Email: "a@corp.com" } } });
    expect(readDocxText(out)).toBe("Contact: A Corp (a@corp.com)");
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
