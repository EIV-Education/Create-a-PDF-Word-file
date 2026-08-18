import en from "./en.json" with { type: "json" };
import vi from "./vi.json" with { type: "json" };

export type Locale = "en" | "vi";

const dictionaries: Record<Locale, Record<string, string>> = { en, vi };

export function translate(locale: Locale | undefined, key: string, fallback?: string): string {
  const dict = dictionaries[locale ?? "en"] ?? dictionaries.en;
  return dict[key] ?? dictionaries.en[key] ?? fallback ?? key;
}

/** Resolves a locale from an `Accept-Language`-ish string or explicit query param. */
export function resolveLocale(input: string | undefined): Locale {
  if (!input) return "en";
  return input.toLowerCase().startsWith("vi") ? "vi" : "en";
}
