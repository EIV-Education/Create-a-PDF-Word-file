# Automating generation with Lark Base Automation

Once you've saved a mapping on the **Field Mapping** screen, its id is all you need to trigger
generation from a Lark Base Automation rule.

## 1. Get your API key and webhook URL

Open **Settings** in Lark DocGen — it shows:

- **Webhook URL**: `https://<your-server>/api/webhook/generate`
- **API key**: sent as the `X-API-Key` header on every call. Anyone with this key can trigger
  generation, so treat it like a password; regenerate it any time from the same screen.

## 2. Get your mapping id

The mapping id isn't shown in the UI directly today — grab it from the network request/response
when saving a mapping (`POST /api/mappings` returns `{ "mapping": { "id": "...", ... } }`), or via
`GET /api/mappings?templateId=...`.

## 3. Create the automation rule

In your Lark Base: **Automation → Create automation**.

**Trigger** — whatever fits your workflow, e.g.:
- *Record created*
- *Record matches condition* (e.g. a "Status" field becomes "Ready to send")
- *Button field clicked* (a manual "Generate document" button per row)

**Action** — **Send webhook request**:
- Method: `POST`
- URL: your webhook URL from step 1
- Headers: `X-API-Key: <your key>`, `Content-Type: application/json`
- Body:
  ```json
  {
    "mapping_id": "<mapping id from step 2>",
    "record_id": "{{Record ID}}"
  }
  ```
  (Use the automation's field-picker to insert the triggering record's id — the exact token name
  depends on your Lark version, e.g. `{{Record ID}}` or a similar system field.)

Save and enable the rule. From then on, matching records generate their document automatically —
if the mapping has a "write generated file back to this attachment field" target configured, the
new Word/PDF file lands right back on the record that triggered it.

## Multiple records at once

Pass `record_ids` (an array) instead of `record_id` if you ever call the webhook from something
other than a per-record trigger:

```json
{ "mapping_id": "...", "record_ids": ["recXXXX", "recYYYY"] }
```

## Chaining further Lark automations

Because the generated file is written back to a normal attachment field on the record, any other
automation rule watching that field (e.g. "when Contract PDF is set → notify the customer") fires
exactly as it would for a manual edit — no special wiring needed on the DocGen side.

## Sending a copy to an external service

Set **"Also send a copy to an external URL"** on the mapping to have Lark DocGen `POST` each
generated file, base64-encoded, to your own endpoint right after it's created:

```json
{
  "recordId": "recXXXX",
  "mappingId": "...",
  "files": [
    { "fileName": "Contract - Acme - 2026-08-18.docx", "mimeType": "application/vnd...wordprocessingml.document", "contentBase64": "..." },
    { "fileName": "Contract - Acme - 2026-08-18.pdf", "mimeType": "application/pdf", "contentBase64": "..." }
  ]
}
```

This delivery is best-effort: a failure to reach the external URL doesn't fail the record's own
generation — check `deliveryStatus`/`deliveryError` on the job result if you need to confirm
delivery succeeded.

## Response

The webhook responds immediately (HTTP 202) with a job id; generation itself runs in the
background, matching how it behaves from the UI's Generate screen (`GET /api/jobs/:id` polls
status; the UI's Generate screen uses this same mechanism when triggered manually).
