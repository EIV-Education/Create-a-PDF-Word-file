/**
 * Renders dynamic filename patterns like
 * "Contract - {Customer_Name} - {Date}.docx" against a flat data object.
 * Deliberately simpler than the docx engine (plain `{tag}` substitution,
 * no loops/expressions) since filenames are single-line strings.
 */
export function renderFilename(pattern: string, data: Record<string, unknown>, extension: string): string {
  const withValues = pattern.replace(/\{([^{}]+)\}/g, (_m, rawTag: string) => {
    const tag = rawTag.trim();
    const value = data[tag];
    return stringifyForFilename(value);
  });
  const sanitized = sanitizeFilename(withValues);
  const withExt = ensureExtension(sanitized, extension);
  return withExt;
}

function stringifyForFilename(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(stringifyForFilename).join("+");
  if (typeof value === "object") return Object.values(value as object).map(stringifyForFilename).join("_");
  return String(value);
}

/** Strips characters illegal on Windows/macOS/Linux filesystems. */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 150 ? cleaned.slice(0, 150).trim() : cleaned || "document";
}

function ensureExtension(name: string, extension: string): string {
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  return name.toLowerCase().endsWith(ext.toLowerCase()) ? name : `${name}${ext}`;
}
