import { describe, expect, it } from "vitest";
import sharp from "sharp";
import PizZip from "pizzip";
import { buildMinimalDocx } from "./helpers/buildDocx.js";
import { compressDocxImages } from "../src/template/imageCompress.js";

async function docxWithMedia(fileName: string, imageBuffer: Buffer): Promise<Buffer> {
  const base = buildMinimalDocx(["A document with an image."]);
  const zip = new PizZip(base);
  zip.file(`word/media/${fileName}`, imageBuffer);
  return zip.generate({ type: "nodebuffer" });
}

describe("compressDocxImages", () => {
  it("shrinks an oversized PNG embedded in the docx", async () => {
    const bigPng = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 10, g: 200, b: 100 } },
    })
      .png()
      .toBuffer();

    const docx = await docxWithMedia("image1.png", bigPng);
    const out = await compressDocxImages(docx, { maxDimension: 800, quality: 70 });

    const outZip = new PizZip(out);
    const compressed = outZip.file("word/media/image1.png")!.asUint8Array();
    const meta = await sharp(Buffer.from(compressed)).metadata();

    expect(meta.width).toBeLessThanOrEqual(800);
    expect(compressed.length).toBeLessThan(bigPng.length);
  });

  it("leaves non-raster media (e.g. emf) untouched", async () => {
    const fakeEmf = Buffer.from("not-a-real-emf-but-thats-fine");
    const docx = await docxWithMedia("image1.emf", fakeEmf);
    const out = await compressDocxImages(docx);
    const outZip = new PizZip(out);
    const bytes = outZip.file("word/media/image1.emf")!.asUint8Array();
    expect(Buffer.from(bytes).equals(fakeEmf)).toBe(true);
  });

  it("produces a still-valid zip when there is nothing to compress", async () => {
    const docx = buildMinimalDocx(["No images here."]);
    const out = await compressDocxImages(docx);
    expect(() => new PizZip(out)).not.toThrow();
  });
});
