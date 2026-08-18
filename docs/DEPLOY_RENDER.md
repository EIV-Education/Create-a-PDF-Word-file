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
5. **Instance type**: pick **Starter** or higher. The **Free** instance type does *not* support
   persistent disks, and this app needs one (see next step) — on Free, every deploy/restart wipes
   your uploaded templates and generated files.
6. **Add a persistent disk** (Advanced → Add Disk):
   - Name: `lark-docgen-data`
   - Mount path: `/data`
   - Size: 1 GB is plenty to start; grow it later if you generate a lot of documents.
7. **Environment variables**:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATA_DIR` | `/data/data` |
   | `FILES_DIR` | `/data/storage-files` |
   | `LARK_DOMAIN` | `https://open.larksuite.com` (or `https://open.feishu.cn` for Feishu) |
   | `LARK_APP_ID` | your Lark custom app's App ID |
   | `LARK_APP_SECRET` | your Lark custom app's App Secret |
   | `WEBHOOK_API_KEY` | leave unset — the server generates one on first boot, viewable/regeneratable from the Settings page |
   | `CORS_ORIGIN` | the frontend's URL once you have it (step 2); `*` works temporarily |

   **`DATA_DIR`/`FILES_DIR` must point under `/data`** (the mounted disk) — this is what makes
   your templates, mappings and generated files survive redeploys and restarts.
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

## Costs & always-on behavior

Render's Starter plan (needed for the disk) keeps the service running continuously — it won't
spin down between requests, which matters if you want webhook calls from Lark Base Automation to
respond promptly at any hour. Check Render's current pricing page for the Starter tier's cost.
