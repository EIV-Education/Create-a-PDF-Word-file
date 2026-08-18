# Lark DocGen

Document automation for [Lark Base](https://www.larksuite.com/base) — turn your Base records into
professional Word and PDF documents. Upload a `.docx` template, map its placeholders to your
table's fields, and generate personalized documents in bulk, straight from a manual click or an
automated Lark Base Automation webhook.

*Công cụ tự động hóa tài liệu cho Lark Base — biến dữ liệu trong Base của bạn thành tài liệu Word
và PDF chuyên nghiệp. Tải mẫu `.docx` lên, ánh xạ trình giữ chỗ với các trường dữ liệu, và tạo
hàng loạt tài liệu cá nhân hóa chỉ với một cú nhấp hoặc tự động qua webhook từ Lark Base
Automation.*

## Features

1. **Simple variable syntax** — `{Field_Name}` placeholders in your Word template. Supports text,
   number and date fields; single- and multi-select; user fields; attachments (as images); nested
   lookup objects and formulas (`{Customer.Email}`, `{Price * Quantity}`); and loops
   (`{#Items}...{/Items}`) for repeating rows/lists. See [docs/TEMPLATE_SYNTAX.md](docs/TEMPLATE_SYNTAX.md).
2. **Batch generation** — generate hundreds of documents in seconds, save straight into a Lark
   attachment field, and track live progress.
3. **Dynamic filenames** — build tidy file names from patterns like
   `Contract - {Customer_Name} - {Date}.docx` or `Invoice_{Invoice_Number}_{Year}.docx`.
4. **PDF support** — automatically convert generated documents to PDF (via LibreOffice headless).
5. **Image compression** — automatically compress images in the generated document to shrink file
   size while keeping quality.
6. **Lark automation** — trigger document generation from an HTTP webhook, run it straight from
   Lark Base Automation, protect it with an API key, let it kick off further Lark automations
   (writing to an attachment field can itself trigger the next rule), and optionally push a copy
   of each generated file to an external service.
7. **Multi-language UI** — English and Vietnamese.

## Project layout

```
server/   Node.js/TypeScript API: template engine, Lark Base client, job runner, webhook
web/      React/TypeScript UI: template upload, field mapping, batch generate, settings
docs/     Template syntax guide, setup guide, webhook integration guide
```

## Quick start

```bash
npm install                      # installs both workspaces
cp server/.env.example server/.env
# edit server/.env: at minimum set LARK_APP_ID / LARK_APP_SECRET (see docs/SETUP.md)

npm run dev:server                # http://localhost:4000
npm run dev:web                   # http://localhost:5173 (proxies /api to :4000)
```

Full walkthrough (creating the Lark app, permissions, deploying): [docs/SETUP.md](docs/SETUP.md).
Deploying to Render (Docker + LibreOffice, persistent storage): [docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md).

## How it fits together

1. **Templates** — upload a `.docx` with `{Field_Name}` placeholders. The server extracts every
   placeholder it finds so the mapping screen can list them automatically.
2. **Mapping** — connect a Base table (App Token + Table ID), match each placeholder to a field
   (auto-match by name, or pick manually), choose the output format (Word/PDF/both), a filename
   pattern, whether to compress images, and optionally which attachment field to write the result
   back into.
3. **Generate** — pick records from the connected table and generate. Progress streams live; each
   result links to its Word/PDF file.
4. **Automate** — point a Lark Base Automation rule's "Send webhook request" action at
   `/api/webhook/generate` with your API key, and generation happens automatically whenever a
   record is created/updated/matches a condition. See [docs/WEBHOOK.md](docs/WEBHOOK.md).

## Tests

```bash
npm test   # server unit tests (vitest): template engine, filename rendering,
           # placeholder extraction, image compression, API key auth, JSON store
```

## Notes on the current implementation

- **Storage** is a small dependency-free JSON-file store (`server/src/storage/jsonStore.ts`) plus
  flat files on disk — no database server to stand up for the MVP. Swap it for Postgres/SQLite
  behind the same `JsonCollection<T>`-shaped interface for real production scale/concurrency.
- **PDF conversion** shells out to headless LibreOffice (`soffice --headless --convert-to pdf`).
  Install LibreOffice on whatever machine runs `server/`.
- **Lark vs Feishu** — set `LARK_DOMAIN` to `https://open.larksuite.com` (Lark, global) or
  `https://open.feishu.cn` (Feishu, China) in `server/.env`.
