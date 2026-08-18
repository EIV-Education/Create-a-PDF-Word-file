# Setup

## 1. Create a Lark (or Feishu) custom app

1. Go to the [Lark Open Platform Developer Console](https://open.larksuite.com/app) (use
   [open.feishu.cn](https://open.feishu.cn/app) instead if your org is on Feishu/China).
2. Create a **Custom App**.
3. Under **Credentials & Basic Info**, copy the **App ID** and **App Secret** — these become
   `LARK_APP_ID` / `LARK_APP_SECRET`.
4. Under **Permissions & Scopes**, add:
   - `bitable:app` (read/write Base records and fields)
   - `drive:drive` or `drive:file` (upload/download attachments used for images and generated
     files)
   Publish the app (or add it as an internal/dev app in your tenant) so the scopes take effect.
5. In the target Lark Base itself, open **... → Add automation / Add app**, and add your custom
   app as a collaborator with edit access to the table(s) you want to generate documents from/into
   — an app can only read/write bases it has been explicitly given access to.

## 2. Configure the server

```bash
cp server/.env.example server/.env
```

Fill in at minimum:

```
LARK_DOMAIN=https://open.larksuite.com   # or https://open.feishu.cn
LARK_APP_ID=cli_xxxxxxxxxxxx
LARK_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```

Everything else has a sensible default — see the comments in `.env.example`. Notably:

- `DATA_DIR` / `FILES_DIR` — where the JSON datastore and uploaded/generated files live. Point
  these at a persistent volume in production (they default to folders next to the server code).
- `SOFFICE_BIN` — only needed if `soffice`/`libreoffice` isn't on `PATH`.
- `WEBHOOK_API_KEY` — optional; leave blank to let the server generate one (viewable/regeneratable
  from the Settings page).

## 3. Install LibreOffice (for PDF conversion)

PDF conversion shells out to headless LibreOffice.

```bash
# Debian/Ubuntu
sudo apt-get install libreoffice

# macOS
brew install --cask libreoffice
```

The Settings page shows whether PDF conversion is currently available so you can confirm the
install worked. Word/DOCX-only generation works fine without it.

## 4. Run it

```bash
npm install
npm run dev:server   # http://localhost:4000
npm run dev:web       # http://localhost:5173
```

For production, build both workspaces and run the compiled server:

```bash
npm run build:server
npm run build:web       # outputs web/dist — serve as static files (nginx, S3+CDN, etc.)
node server/dist/index.js
```

Put a reverse proxy (nginx, Caddy, your platform's ingress) in front of `server/` for TLS, and
either serve `web/dist` from the same origin (simplest — no CORS to think about) or host it
separately and set `CORS_ORIGIN` on the server plus `VITE_API_BASE_URL` when building the web app.

## 5. Find your Base's App Token and Table ID

Open the Base in your browser; the URL looks like:

```
https://base.larksuite.com/base/<App Token>?table=<Table ID>&view=...
```

Both the Mapping screen and the webhook payload need these two values.

## Next steps

- [docs/TEMPLATE_SYNTAX.md](TEMPLATE_SYNTAX.md) — how to write `{Field_Name}` templates.
- [docs/WEBHOOK.md](WEBHOOK.md) — wiring this up to Lark Base Automation for hands-off generation.
