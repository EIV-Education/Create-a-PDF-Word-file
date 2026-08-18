import { slugifyFieldName } from "../utils/slugify.js";
import type { Placeholder } from "../template/placeholders.js";
import type { LarkField } from "../lark/client.js";
import type { FieldMappingEntry, MappedFieldKind } from "../models.js";

/**
 * Normalizes a name for matching purposes: strip diacritics/punctuation to
 * underscores (slugifyFieldName), then lowercase - so "MỨC_LƯƠNG" and
 * "Mức lương" compare equal regardless of case, spacing, or exactly how
 * each was typed.
 */
function normalize(name: string): string {
  return slugifyFieldName(name).toLowerCase();
}

function placeholderKindToMappedKind(kind: Placeholder["kind"]): MappedFieldKind {
  if (kind === "image") return "image";
  if (kind === "loop") return "loop";
  return "value";
}

/**
 * Matches a template's extracted placeholder tags to a Lark table's fields
 * by normalized name, for the Mapping screen's "Auto-match by name"
 * button.
 *
 * Template tags are typically typed in directly by whoever authored the
 * template - any language, case, spacing (see template/parser.ts, which
 * no longer requires a slugified/ASCII tag form). Regression: comparing a
 * *slugified* field name against the *raw, unslugified* placeholder tag
 * only matched by coincidence and silently skipped most real-world
 * Vietnamese templates ("MỨC_LƯƠNG" never matched a field literally named
 * "Mức lương") - both sides must be normalized the same way.
 */
export function suggestFieldMatches(placeholders: Placeholder[], fields: LarkField[]): FieldMappingEntry[] {
  const fieldByNormalizedName = new Map(fields.map((f) => [normalize(f.field_name), f]));

  const suggestions: FieldMappingEntry[] = [];
  for (const placeholder of placeholders) {
    if (placeholder.kind === "section") continue;
    const match = fieldByNormalizedName.get(normalize(placeholder.name));
    if (!match) continue;
    suggestions.push({
      tag: placeholder.name,
      larkFieldId: match.field_id,
      larkFieldName: match.field_name,
      larkFieldType: match.type,
      kind: placeholderKindToMappedKind(placeholder.kind),
    });
  }
  return suggestions;
}
