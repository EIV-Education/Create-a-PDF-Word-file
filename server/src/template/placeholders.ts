import PizZip from "pizzip";

export type PlaceholderKind = "field" | "loop" | "image" | "section" | "raw";

export interface Placeholder {
  /** The tag name without its `{`, `}`, `#`, `/`, `^` or `%` markers. */
  name: string;
  kind: PlaceholderKind;
  /** Original raw text as it appears in the template, e.g. "{#Items}". */
  raw: string;
}

const XML_PARTS = [
  "word/document.xml",
  "word/header1.xml",
  "word/header2.xml",
  "word/header3.xml",
  "word/footer1.xml",
  "word/footer2.xml",
  "word/footer3.xml",
  "word/footnotes.xml",
  "word/endnotes.xml",
];

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXmlEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m);
}

/** Flattens a docx XML part to plain text, dropping all markup tags. */
function flattenXml(xml: string): string {
  return decodeXmlEntities(xml.replace(/<[^>]+>/g, ""));
}

/**
 * Scans a .docx buffer for `{tag}` / `{#loop}` / `{/loop}` / `{^section}` /
 * `{%image}` placeholders and returns a de-duplicated, first-seen-order
 * list. This is a lightweight text scan (not a full docxtemplater parse) so
 * it can run before any data mapping exists, e.g. right after upload to
 * populate the field-mapping UI.
 *
 * Caveat: Word occasionally splits a single `{tag}` across multiple runs
 * (autocorrect, spell-check). Flattening the XML by stripping tags mostly
 * papers over this since it concatenates run text before scanning, but a
 * placeholder interrupted by a paragraph/table boundary can still be
 * missed — advise users to type templates with autocorrect off if a tag
 * doesn't show up.
 */
export function extractPlaceholders(docxBuffer: Buffer): Placeholder[] {
  const zip = new PizZip(docxBuffer);
  const seen = new Set<string>();
  const result: Placeholder[] = [];

  for (const partName of XML_PARTS) {
    const file = zip.file(partName);
    if (!file) continue;
    const text = flattenXml(file.asText());
    const matches = text.matchAll(/\{([^{}]*)\}/g);
    for (const m of matches) {
      const inner = m[1]?.trim() ?? "";
      if (!inner) continue;
      let kind: PlaceholderKind = "field";
      let name = inner;
      if (inner.startsWith("#")) {
        kind = "loop";
        name = inner.slice(1).trim();
      } else if (inner.startsWith("/")) {
        // closing tag for a loop/section - skip, the opening tag already
        // registers it.
        continue;
      } else if (inner.startsWith("^")) {
        kind = "section";
        name = inner.slice(1).trim();
      } else if (inner.startsWith("%")) {
        kind = "image";
        name = inner.slice(1).trim();
      } else if (inner.startsWith("@")) {
        kind = "raw";
        name = inner.slice(1).trim();
      }
      if (name === ".") continue; // loop-local reference, not a mappable field
      const key = `${kind}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ name, kind, raw: `{${inner}}` });
    }
  }

  return result;
}
