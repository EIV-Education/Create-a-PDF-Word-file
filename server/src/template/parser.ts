import angularExpressions from "angular-expressions";

/**
 * Custom docxtemplater tag parser, extending the standard "angular-parser"
 * recipe (https://docxtemplater.com/docs/angular-parse/) with a plain
 * literal-lookup fallback.
 *
 * Why: angular-expressions compiles a tag as a JS-like expression, which
 * requires its text to look like a valid identifier — its lexer does not
 * accept Vietnamese diacritics or many other non-ASCII letters (confirmed
 * in production: a template with raw field names like `{SỐ_HĐLĐ}` or
 * `{HỌ_TÊN}` failed to compile every single tag). Real templates are
 * typically authored by typing the field name in directly, in whatever
 * language, with spaces and native characters — not a slugified/ASCII
 * form — so that has to just work.
 *
 * The fix: only tags that actually *look* like an expression (contain a
 * dot for nested access, an operator, a filter `|`, quotes, etc.) attempt
 * angular-expressions compilation at all, and even then fall back to a
 * plain literal property lookup if compilation fails. Every other tag
 * (the overwhelming common case — a plain field reference) is looked up
 * directly by its exact, untouched text, so any field name works
 * regardless of language, spacing, or capitalization. This still gives
 * us, for tags that need it:
 *   - dot access for nested/lookup fields: {Customer.Email}
 *   - simple formulas: {Price * Quantity}, {Total | currency}
 *   - the loop-local "." token used inside {#Items}...{/Items}
 */
const LOOKS_LIKE_EXPRESSION = /[.|*+()[\]'"!=<>&]/;

function mergeScope(context: { scopeList: unknown[]; num: number }): Record<string, unknown> {
  let merged: Record<string, unknown> = {};
  for (let i = 0, len = context.num + 1; i < len; i++) {
    merged = Object.assign(merged, context.scopeList[i] as object);
  }
  return merged;
}

function literalLookup(tag: string) {
  const key = tag.trim();
  return {
    get(scope: unknown, context: { scopeList: unknown[]; num: number }) {
      const merged = mergeScope(context);
      if (key in merged) return merged[key];
      return (scope as Record<string, unknown> | undefined)?.[key];
    },
  };
}

export function angularParser(tag: string) {
  if (tag === ".") {
    return {
      get(scope: unknown) {
        return scope;
      },
    };
  }

  if (LOOKS_LIKE_EXPRESSION.test(tag)) {
    try {
      // Curly/smart quotes occasionally sneak in via Word autocorrect;
      // normalize them so `{Name | upper}`-style expressions with quoted
      // args still parse.
      const cleaned = tag.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
      const expr = angularExpressions.compile(cleaned);
      return {
        get(scope: unknown, context: { scopeList: unknown[]; num: number }) {
          return expr(scope, mergeScope(context));
        },
      };
    } catch {
      // Not actually a valid expression (e.g. a field literally named
      // "Q&A" or "Giá (VNĐ)") - fall through to a plain literal lookup.
    }
  }

  return literalLookup(tag);
}
