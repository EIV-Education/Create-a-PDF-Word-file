import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
// @ts-expect-error - no bundled types
import ImageModule from "docxtemplater-image-module-free";
import sharp from "sharp";
import { angularParser } from "./parser.js";

export interface ImageAsset {
  buffer: Buffer;
  width: number;
  height: number;
}

export interface RenderOptions {
  /** Data object keyed by slugified field tags (see utils/slugify.ts). */
  data: Record<string, unknown>;
  /**
   * Images referenced by `{%tag}` placeholders, keyed by the *value* the
   * tag resolves to in `data` (typically the Lark attachment file token).
   */
  images?: Map<string, ImageAsset>;
  /** Max display width (px) for inserted images; height scales to match. */
  maxImageWidthPx?: number;
}

export class TemplateRenderError extends Error {
  details: string[];
  constructor(message: string, details: string[]) {
    super(message);
    this.name = "TemplateRenderError";
    this.details = details;
  }
}

const FALLBACK_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function buildImageModule(images: Map<string, ImageAsset>, maxWidthPx: number) {
  const missing = new Set<string>();
  return new ImageModule({
    centered: false,
    getImage(tagValue: unknown) {
      const key = String(tagValue ?? "");
      const asset = images.get(key);
      if (!asset) {
        missing.add(key);
        return FALLBACK_PIXEL;
      }
      return asset.buffer;
    },
    getSize(_img: Buffer, tagValue: unknown) {
      const key = String(tagValue ?? "");
      const asset = images.get(key);
      if (!asset || !asset.width || !asset.height) return [120, 120];
      const scale = Math.min(1, maxWidthPx / asset.width);
      return [Math.round(asset.width * scale), Math.round(asset.height * scale)];
    },
  });
}

/**
 * Renders a .docx template buffer against `data`, resolving `{Tag}` /
 * `{#Loop}...{/Loop}` / `{%ImageTag}` placeholders. Throws
 * `TemplateRenderError` with human-readable per-tag explanations on
 * malformed templates (unclosed loops, invalid expressions, etc.).
 */
export function renderDocx(templateBuffer: Buffer, options: RenderOptions): Buffer {
  const zip = new PizZip(templateBuffer);
  const images = options.images ?? new Map();
  const imageModule = buildImageModule(images, options.maxImageWidthPx ?? 500);

  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      parser: angularParser,
      modules: [imageModule],
      nullGetter: () => "",
      errorLogging: false,
    });
  } catch (err) {
    throw toRenderError(err, "Failed to load the template");
  }

  try {
    doc.render(options.data);
  } catch (err) {
    throw toRenderError(err, "Failed to render the document");
  }

  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

function toRenderError(err: unknown, message: string): TemplateRenderError {
  const anyErr = err as any;
  const details: string[] =
    anyErr?.properties?.errors?.map((e: any) => e?.properties?.explanation ?? e?.message ?? String(e)) ??
    (anyErr?.message ? [anyErr.message] : [String(err)]);
  return new TemplateRenderError(message, details);
}

/**
 * Loads image bytes + intrinsic dimensions via sharp, ready to be handed to
 * `renderDocx` as the `images` map. Downscales anything already larger than
 * `maxDimension` so oversized source photos don't bloat the render.
 */
export async function prepareImageAsset(buffer: Buffer, maxDimension = 1600): Promise<ImageAsset> {
  const img = sharp(buffer, { failOn: "none" });
  const meta = await img.metadata();
  let width = meta.width ?? 0;
  let height = meta.height ?? 0;
  let out = buffer;

  if (width > maxDimension || height > maxDimension) {
    out = await img.resize({ width: maxDimension, height: maxDimension, fit: "inside" }).toBuffer();
    const resizedMeta = await sharp(out).metadata();
    width = resizedMeta.width ?? width;
    height = resizedMeta.height ?? height;
  }

  return { buffer: out, width, height };
}
