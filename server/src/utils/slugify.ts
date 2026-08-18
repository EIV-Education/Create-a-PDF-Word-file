/**
 * Turns a (possibly Unicode, spaced, punctuated) Lark field name into a
 * stable ASCII tag safe to use inside `{Tag_Name}` placeholders and as an
 * `angular-expressions` identifier. Vietnamese diacritics are transliterated
 * rather than dropped, so "Tên khách hàng" -> "Ten_khach_hang".
 */
const VIETNAMESE_MAP: Record<string, string> = {
  đ: "d",
  Đ: "D",
};

export function slugifyFieldName(name: string): string {
  let s = name.trim();
  s = s.replace(/[đĐ]/g, (ch) => VIETNAMESE_MAP[ch] ?? ch);
  // Strip combining diacritical marks after Unicode NFD normalization
  // (covers Vietnamese, French, etc. accented Latin letters).
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^A-Za-z0-9]+/g, "_");
  s = s.replace(/^_+|_+$/g, "");
  if (!s) s = "Field";
  if (/^[0-9]/.test(s)) s = `_${s}`;
  return s;
}

/** Slugifies a batch of field names, appending _2, _3... on collisions. */
export function slugifyFieldNames(names: string[]): Map<string, string> {
  const used = new Map<string, number>();
  const result = new Map<string, string>();
  for (const name of names) {
    const base = slugifyFieldName(name);
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    const tag = count === 0 ? base : `${base}_${count + 1}`;
    result.set(name, tag);
  }
  return result;
}
