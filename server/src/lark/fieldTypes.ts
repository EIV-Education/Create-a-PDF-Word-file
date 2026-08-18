/**
 * Lark Bitable field type codes -> human labels, and value normalizers that
 * turn a raw record field value into something safe/useful to drop into a
 * Word template (plain strings, arrays for loops, nested objects for
 * lookups, image references for attachments).
 *
 * Type codes: https://open.larksuite.com/document/server-docs/docs/bitable-v1/bitable-structure
 */
export const LARK_FIELD_TYPES: Record<number, string> = {
  1: "text",
  2: "number",
  3: "single_select",
  4: "multi_select",
  5: "date",
  7: "checkbox",
  11: "user",
  13: "phone",
  15: "url",
  17: "attachment",
  18: "link", // one-way link to another table
  19: "lookup",
  20: "formula",
  21: "two_way_link",
  22: "location",
  23: "group_chat",
  1001: "created_time",
  1002: "modified_time",
  1003: "created_user",
  1004: "modified_user",
  1005: "auto_number",
};

export function fieldTypeLabel(type: number): string {
  return LARK_FIELD_TYPES[type] ?? `unknown(${type})`;
}

export interface NormalizedAttachment {
  fileToken: string;
  name: string;
  isImage: boolean;
}

export interface NormalizeResult {
  /** Value to place directly into the docxtemplater data object. */
  value: unknown;
  /** Any attachments discovered (so the caller can pre-download them for image tags). */
  attachments: NormalizedAttachment[];
}

const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|webp)$/i;

function isImageAttachment(name: string, type?: string): boolean {
  if (type && type.startsWith("image/")) return true;
  return IMAGE_EXT.test(name);
}

/** Formats a Lark date/time value (epoch millis) using a fixed, locale-stable format. */
function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Lark's plain "text" field type (and several others: lookups/formulas over
 * a text field, some URL/mention fields) doesn't return a plain string —
 * it returns an array of rich-text *segments*, e.g.
 * `[{"type":"text","text":"Phạm Hồng Sơn"}]`, so it can represent bold
 * runs, @mentions, embedded links etc. Concatenates every segment's text,
 * recursing into nested arrays/objects (a lookup over a text field nests
 * one more level: `{value: [[{type:"text",text:"..."}]]}`). Falls back to
 * JSON.stringify only for a genuinely unrecognized object shape, so
 * unexpected data is still visible rather than silently dropped.
 */
function extractRichText(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) return raw.map(extractRichText).join("");
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if ("text" in obj) return extractRichText(obj.text);
    return JSON.stringify(raw);
  }
  return String(raw);
}

/**
 * Converts a raw Lark field value into a plain-JS value suitable for the
 * template engine. `type` is the Lark field type code from listFields().
 */
export function normalizeFieldValue(type: number, raw: unknown): NormalizeResult {
  const label = fieldTypeLabel(type);
  const attachments: NormalizedAttachment[] = [];

  if (raw === null || raw === undefined) return { value: "", attachments };

  switch (label) {
    case "text":
      return { value: extractRichText(raw), attachments };

    case "date":
    case "created_time":
    case "modified_time":
      return { value: typeof raw === "number" ? formatDate(raw) : String(raw), attachments };

    case "checkbox":
      return { value: Boolean(raw), attachments };

    case "single_select":
      return { value: typeof raw === "string" ? raw : String((raw as any)?.text ?? raw), attachments };

    case "multi_select": {
      const arr = Array.isArray(raw) ? raw : [raw];
      return { value: arr.map(String), attachments };
    }

    case "user":
    case "created_user":
    case "modified_user": {
      const arr = Array.isArray(raw) ? raw : [raw];
      const users = arr.map((u: any) => ({ name: u?.name ?? "", email: u?.email ?? "", id: u?.id ?? "" }));
      return { value: users.length === 1 ? users[0] : users, attachments };
    }

    case "attachment": {
      const arr = (Array.isArray(raw) ? raw : [raw]) as Array<{
        file_token: string;
        name: string;
        type?: string;
      }>;
      const normalized = arr
        .filter((a) => a && a.file_token)
        .map((a) => {
          const isImage = isImageAttachment(a.name ?? "", a.type);
          attachments.push({ fileToken: a.file_token, name: a.name, isImage });
          return { fileToken: a.file_token, name: a.name, isImage };
        });
      // Value exposed to the template is the file token(s); the image
      // module resolves file tokens back to downloaded buffers (see
      // template/engine.ts). Non-image attachments render as their name.
      return {
        value: normalized.length === 1 ? normalized[0]!.fileToken : normalized.map((a) => a.fileToken),
        attachments,
      };
    }

    case "link":
    case "two_way_link": {
      const arr = Array.isArray(raw) ? raw : [raw];
      return { value: arr.map((v: any) => extractRichText(v?.text ?? v)), attachments };
    }

    case "lookup": {
      // Lookups come back as { type, value: [...] } wrapping the looked-up
      // field's own values (which can themselves be any of the above types,
      // including a nested rich-text-segment array if looking up a text field).
      const inner = (raw as any)?.value ?? raw;
      const arr = Array.isArray(inner) ? inner : [inner];
      return { value: arr.map((v: any) => extractRichText(v)), attachments };
    }

    case "formula": {
      const inner = (raw as any)?.value ?? raw;
      // A numeric/boolean formula result should stay numeric/boolean (so
      // {Formula_Field} can still be used in downstream arithmetic) -
      // only rich-text-segment shapes get flattened to text.
      const normalizeOne = (v: unknown) => (typeof v === "number" || typeof v === "boolean" ? v : extractRichText(v));
      return { value: Array.isArray(inner) ? inner.map(normalizeOne) : normalizeOne(inner), attachments };
    }

    case "number":
      return { value: typeof raw === "number" ? raw : Number(raw), attachments };

    case "location":
      return { value: (raw as any)?.address ?? String(raw), attachments };

    default:
      // Covers phone/url/group_chat/auto_number and any future/unlisted
      // type - most of which follow the same rich-text-segment shape as
      // plain text fields.
      return { value: typeof raw === "object" ? extractRichText(raw) : raw, attachments };
  }
}
