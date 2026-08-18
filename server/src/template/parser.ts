import angularExpressions from "angular-expressions";

/**
 * Custom docxtemplater tag parser (the standard "angular-parser" recipe:
 * https://docxtemplater.com/docs/angular-parse/). This upgrades the default
 * flat `{tag}` lookup into a real expression evaluator, which is what gives
 * us:
 *   - dot access for nested/lookup fields: {Customer.Email}
 *   - simple formulas: {Price * Quantity}, {Total | currency}
 *   - the loop-local "." token used inside {#Items}...{/Items}
 *
 * Because expressions are parsed as JS-like identifiers, every tag in the
 * rendered template must be one of our slugified, ASCII-safe field tags
 * (see utils/slugify.ts) rather than the raw Lark field name.
 */
export function angularParser(tag: string) {
  if (tag === ".") {
    return {
      get(scope: unknown) {
        return scope;
      },
    };
  }
  // Curly/smart quotes occasionally sneak in via Word autocorrect; normalize
  // them so `{Name | upper}`-style expressions with quoted args still parse.
  const cleaned = tag.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const expr = angularExpressions.compile(cleaned);
  return {
    get(scope: unknown, context: { scopeList: unknown[]; num: number }) {
      let obj: Record<string, unknown> = {};
      const scopeList = context.scopeList;
      for (let i = 0, len = context.num + 1; i < len; i++) {
        obj = Object.assign(obj, scopeList[i] as object);
      }
      return expr(scope, obj);
    },
  };
}
