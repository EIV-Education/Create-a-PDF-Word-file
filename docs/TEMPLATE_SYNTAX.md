# Template syntax

Lark DocGen renders `.docx` templates with [docxtemplater](https://docxtemplater.com/), configured
with the [angular-expressions](https://www.npmjs.com/package/angular-expressions) parser and the
free image module. This document is the practical reference for what you can write inside a
template.

## The tag itself

Every placeholder is a **tag** — the slugified, ASCII-safe version of your Lark field's name,
e.g. the field "Customer Name" becomes the tag `Customer_Name`. The Mapping screen shows you the
exact tag for every field ("Auto-match by name" fills this in for you); you can also type the tag
yourself and the mapping step will map it back to the field of your choice regardless of what the
field is actually called in Lark.

Because tags are parsed as JS-like expressions, they must look like identifiers: letters, digits,
underscores, not starting with a digit, no spaces or punctuation. Vietnamese names transliterate
their diacritics (`Tên khách hàng` → `Ten_khach_hang`) rather than dropping them, so mapped tags
stay readable.

## 1. Plain values

```
Dear {Customer_Name},

Your invoice total is {Total_Amount} due on {Due_Date}.
```

Works for text, number, date, single-select, checkbox, user, link and formula fields — whatever
normalizes to a plain string/number renders directly.

## 2. Nested / lookup fields

Lark "lookup" fields (and any field you choose to expose as a nested object) support dot access:

```
{Customer.Name} <{Customer.Email}>
```

## 3. Simple formulas

Because tags are evaluated as expressions, you can do lightweight arithmetic and filters directly
in the template:

```
Line total: {Unit_Price * Quantity}
```

(Prefer doing real calculations in a Lark formula field and mapping its result — this is meant for
small conveniences, not a spreadsheet engine.)

## 4. Loops (repeating rows / lists)

Wrap a section in `{#Field_Name}...{/Field_Name}` to repeat it once per item — typically used with
a Lark "link"/lookup field that returns multiple related records, or a multi-select. Inside the
loop, tags resolve against each item:

```
{#Items}
- {Item_Name}: {Item_Price}
{/Items}
```

Put the loop markers around a table row (`{#Items}` in the first cell, `{/Items}` in the last) to
repeat the whole row per item — this is the standard way to render an order/line-item table.

## 5. Conditional sections

`{^Field_Name}...{/Field_Name}` renders its content only when `Field_Name` is falsy (empty text,
`0`, `false`, an empty array) — handy for "only show this paragraph if there's a discount" style
templates, driven off a checkbox or a formula field.

## 6. Images / attachments

Map an attachment field with kind **Image** on the Mapping screen, then reference it with a `%`
prefix:

```
{%Signature_Photo}
```

- If the field holds a single file, `{%Tag}` inserts it directly.
- If it holds several files, `{%Tag_first}` always inserts the first one (a convenience alias the
  server adds automatically), or loop over all of them:

```
{#Photos}{%.}{/Photos}
```

Non-image attachments mapped as a plain **Value** field render as their file name.

Images are automatically downscaled to a sensible display size while rendering, and — if
"Compress images" is enabled on the mapping — every raster image in the final document (including
ones that were already part of the template, not just ones inserted from Lark) is re-encoded at a
lower quality to shrink the file.

## Tips

- **Turn off autocorrect/autocomplete** in Word while authoring templates. Word sometimes splits a
  typed `{tag}` across multiple hidden runs (e.g. after autocorrecting a straight quote inside it),
  which can prevent the tag from being recognized. If a tag doesn't show up on the Mapping screen
  after upload, retype it with autocorrect off, or select the whole `{tag}` text and retype it in
  one go.
- **Missing data renders as blank**, not an error — a mapped field with no value in a given record
  just produces empty text, so generation never fails because one field was empty.
- **Malformed templates** (an unclosed loop, a stray `{`) are reported back with the exact tag and
  a human-readable explanation when you try to save/generate, rather than a raw stack trace.
