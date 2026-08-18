import PizZip from "pizzip";
import sharp from "sharp";

const MEDIA_PREFIX = "word/media/";
// Only formats we can re-encode back into the *same* container format are
// eligible: the docx's [Content_Types].xml declares a MIME type per file
// extension, so writing JPEG bytes into a "*.bmp" entry (say) would desync
// the declared content type from the actual bytes and can break rendering
// in Word. bmp/tiff/emf/wmf are left untouched for that reason.
const RASTER_EXT = /\.(png|jpe?g|gif)$/i;

export interface CompressImagesOptions {
  maxDimension?: number;
  quality?: number;
}

/**
 * Post-processing pass that walks every raster image embedded in a
 * generated .docx (both ones that were already in the template and ones we
 * just inserted via `{%tag}`), downscaling anything oversized and
 * re-encoding at a lower quality to shrink file size. Vector/EMF/WMF media
 * and anything sharp can't decode is left untouched.
 */
export async function compressDocxImages(docxBuffer: Buffer, opts: CompressImagesOptions = {}): Promise<Buffer> {
  const maxDimension = opts.maxDimension ?? 1600;
  const quality = opts.quality ?? 78;

  const zip = new PizZip(docxBuffer);
  const mediaFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith(MEDIA_PREFIX) && RASTER_EXT.test(name) && !zip.files[name]?.dir
  );

  await Promise.all(
    mediaFiles.map(async (name) => {
      const original = zip.file(name)!.asUint8Array();
      try {
        const compressed = await compressOne(Buffer.from(original), name, maxDimension, quality);
        // Only replace if we actually shrank it - never let compression
        // make a file bigger.
        if (compressed && compressed.length < original.length) {
          zip.file(name, compressed);
        }
      } catch {
        // Leave the original bytes in place if sharp can't handle this
        // particular image (e.g. a CMYK TIFF or corrupt file).
      }
    })
  );

  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

async function compressOne(buf: Buffer, name: string, maxDimension: number, quality: number): Promise<Buffer | null> {
  const img = sharp(buf, { failOn: "none" });
  const meta = await img.metadata();
  if (!meta.width || !meta.height) return null;

  let pipeline = img;
  if (meta.width > maxDimension || meta.height > maxDimension) {
    pipeline = pipeline.resize({ width: maxDimension, height: maxDimension, fit: "inside" });
  }

  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) {
    return pipeline.png({ quality, compressionLevel: 9 }).toBuffer();
  }
  if (lower.endsWith(".gif")) {
    // sharp can resize gifs but re-encoding animated gifs at quality loses
    // frames; only touch static ones.
    if ((meta.pages ?? 1) > 1) return null;
    return pipeline.gif().toBuffer();
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  return null;
}
