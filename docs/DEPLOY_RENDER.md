# Deploying to Render

This is the reliable, click-by-click path (the `render.yaml` Blueprint at the repo root does the
same thing in one step if it parses cleanly on your account — try it first if you like, fall back
to this if it doesn't).

## 1. Backend (the `server/` API) — Web Service, Docker

1. Render dashboard → **New +** → **Web Service**.
2. Connect the `EIV-Education/Create-a-PDF-Word-file` GitHub repo.
3. Branch: `claude/lark-document-automation-qufp7c` (or `main` once this is merged).
4. **Runtime**: Docker.
   - **Root Directory**: leave blank (repo root — needed because this is an npm-workspaces
     monorepo; the Dockerfile reads the root `package-lock.json`).
   - **Dockerfile Path**: `server/Dockerfile`
5. **Instance type**: **Starter** is enough (Free spins down after inactivity, which delays
   webhook responses from Lark Base Automation — see "Costs" below).
6. **Persistent disk — optional.** Generated documents (the .docx/.pdf files) are *not* meant to
   live on this server permanently: each one auto-uploads to the Lark attachment field you
   configure on its mapping, and the server's own copy is just short-lived scratch space for the
   UI's "download" link (auto-deleted after `OUTPUT_FILE_TTL_HOURS`, default 24h) — so it never
   needs a growing disk.
   The one thing that *does* benefit from persisting is your setup itself — uploaded templates and
   saved field mappings (a few KB total). Without a disk, a redeploy/restart wipes that config and
   you'd re-upload the template + redo the mapping (a couple of minutes). Your call:
   - **Skip the disk** → stay on Free/no-disk, simplest and cheapest, just re-set-up after deploys.
   - **Add a small disk** (Advanced → Add Disk: name `lark-docgen-data`, mount path `/data`, size
     1 GB) → your template/mapping setup survives redeploys too. If you do this, also set
     `DATA_DIR=/data/data` and `FILES_DIR=/data/storage-files` in step 7 so it actually uses the disk.
7. **Environment variables**:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `LARK_DOMAIN` | `https://open.larksuite.com` (or `https://open.feishu.cn` for Feishu) |
   | `LARK_APP_ID` | your Lark custom app's App ID |
   | `LARK_APP_SECRET` | your Lark custom app's App Secret |
   | `WEBHOOK_API_KEY` | leave unset — the server generates one on first boot, viewable/regeneratable from the Settings page |
   | `CORS_ORIGIN` | the frontend's URL once you have it (step 2); `*` works temporarily |
   | `DATA_DIR` / `FILES_DIR` | only if you added the disk (step 6) — `/data/data` and `/data/storage-files` |

8. **Health check path**: `/api/health`.
9. **Create Web Service** and wait for the first build (installing LibreOffice takes a few
   minutes). Once live, note the service URL, e.g. `https://lark-docgen-server.onrender.com`.
10. Sanity check:
    ```bash
    curl https://lark-docgen-server.onrender.com/api/health
    curl https://lark-docgen-server.onrender.com/api/settings
    ```
    `larkConfigured` should read `true` and `pdfConversionAvailable` should read `true`.

## 2. Frontend (the `web/` UI)

Any static host works — Render Static Site keeps everything in one place:

1. **New +** → **Static Site** → same repo/branch.
2. **Build command**: `npm install && npm run build --workspace web`
3. **Publish directory**: `web/dist`
4. **Environment variable**: `VITE_API_BASE_URL` = the backend URL from step 1.9 (e.g.
   `https://lark-docgen-server.onrender.com/api`).
5. Deploy. Once you have the frontend's URL, go back to the backend service's env vars and set
   `CORS_ORIGIN` to that exact URL (instead of `*`), then redeploy the backend.

(Vercel or Cloudflare Pages work equally well for this static part if you'd rather keep the
frontend there — same build command and output directory, same `VITE_API_BASE_URL` env var.)

## 3. Wire up Lark Base Automation

Once both are live: open the frontend URL → **Settings** to get your webhook URL + API key, then
follow [docs/WEBHOOK.md](WEBHOOK.md) to connect a Lark Base Automation rule.

## Before you rely on this in production

The app currently has **no login of its own** — anyone with the frontend URL can upload templates,
browse mappings, and trigger generation (only the `/api/webhook/generate` endpoint is protected,
by the API key). That's fine while you're the only one with the URL, but consider putting the
frontend behind your team's SSO/VPN, or ask for a basic shared-password gate to be added, before
sharing the URL more widely.

## Making sure documents actually land in Lark

The whole point of skipping server-side storage is that every generated file ends up in Lark, so
double check on the **Field Mapping** screen that **"Write generated file(s) back to this
attachment field"** is set to a real attachment field for every mapping you use — that's what
makes generation auto-save into Lark instead of only sitting in the (short-lived, auto-deleted)
local copy.

## Costs & always-on behavior

Render's Starter plan keeps the service running continuously — it won't spin down between
requests, which matters if you want webhook calls from Lark Base Automation to respond promptly at
any hour. Free-tier services spin down after inactivity and take a few seconds to wake back up on
the next request. Check Render's current pricing page for exact costs.
