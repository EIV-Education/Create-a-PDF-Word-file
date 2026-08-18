import { randomUUID } from "node:crypto";
import axios from "axios";
import { larkClient, LarkRecord } from "../lark/client.js";
import { normalizeFieldValue } from "../lark/fieldTypes.js";
import { renderDocx, prepareImageAsset, ImageAsset, TemplateRenderError } from "../template/engine.js";
import { compressDocxImages } from "../template/imageCompress.js";
import { renderFilename } from "../template/filename.js";
import { convertDocxToPdf, PdfConversionError } from "../pdf/convert.js";
import { outputFiles } from "../storage/fileStore.js";
import { templateFileStorage } from "../storage/templateFileStorage.js";
import { outputFilesMetaDb } from "../db.js";
import { appendResult, createJob, finishJob, markRunning } from "./jobManager.js";
import { config } from "../config.js";
import type { JobRecord, JobResultItem, MappingRecord, TemplateRecord } from "../models.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME = "application/pdf";

async function saveOutput(buffer: Buffer, fileName: string, contentType: string): Promise<string> {
  const id = randomUUID();
  await outputFiles.save(id, buffer);
  await outputFilesMetaDb.insert({ id, fileName, contentType, createdAt: new Date().toISOString() });
  return id;
}

export interface RunBatchParams {
  template: TemplateRecord;
  mapping: MappingRecord;
  recordIds: string[];
  source: "manual" | "webhook";
}

/**
 * Creates a job row and kicks off generation in the background (not
 * awaited by the caller) so HTTP handlers can return the job id
 * immediately and the client can poll/SSE for progress.
 */
export async function startBatchJob(params: RunBatchParams): Promise<JobRecord> {
  const job = await createJob({
    templateId: params.template.id,
    mappingId: params.mapping.id,
    source: params.source,
    total: params.recordIds.length,
  });

  void runBatchJob(job.id, params).catch(async (err) => {
    await finishJob(job.id, err instanceof Error ? err.message : String(err));
  });

  return job;
}

async function runBatchJob(jobId: string, params: RunBatchParams): Promise<void> {
  const { template, mapping, recordIds } = params;
  await markRunning(jobId);

  if (recordIds.length === 0) {
    await finishJob(jobId, "No records were selected for generation.");
    return;
  }

  const templateBuffer = await templateFileStorage.read(template.fileId);
  const records = await larkClient.listRecords(mapping.larkAppToken, mapping.larkTableId, { recordIds });
  const byId = new Map(records.map((r) => [r.record_id, r]));

  for (const recordId of recordIds) {
    const record = byId.get(recordId);
    if (!record) {
      await appendResult(jobId, { recordId, status: "error", error: "Record not found in Lark Base." });
      continue;
    }
    try {
      const generated = await generateOne(record, mapping, templateBuffer);
      await appendResult(jobId, { recordId, status: "success", ...generated });
    } catch (err) {
      const message =
        err instanceof TemplateRenderError
          ? `${err.message}: ${err.details.join("; ")}`
          : err instanceof PdfConversionError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
      await appendResult(jobId, { recordId, status: "error", error: message });
    }
  }

  await finishJob(jobId);
}

async function generateOne(
  record: LarkRecord,
  mapping: MappingRecord,
  templateBuffer: Buffer
): Promise<Omit<JobResultItem, "recordId" | "status" | "error">> {
  const data: Record<string, unknown> = {};
  const images = new Map<string, ImageAsset>();

  for (const entry of mapping.fields) {
    const raw = record.fields[entry.larkFieldName];
    const { value, attachments } = normalizeFieldValue(entry.larkFieldType, raw);
    data[entry.tag] = value;

    if (entry.kind === "image" && attachments.length > 0) {
      // Convenience alias so templates can do {%Tag_first} even when the
      // field holds multiple attachments (data[tag] stays an array/loop
      // source in that case).
      data[`${entry.tag}_first`] = attachments[0]!.fileToken;
      for (const att of attachments) {
        if (images.has(att.fileToken)) continue;
        const buf = await larkClient.downloadAttachment(att.fileToken);
        images.set(att.fileToken, await prepareImageAsset(buf, config.images.maxDimension));
      }
    }
  }

  let docx = renderDocx(templateBuffer, { data, images, maxImageWidthPx: 500 });

  if (mapping.compressImages) {
    docx = await compressDocxImages(docx, {
      maxDimension: config.images.maxDimension,
      quality: config.images.quality,
    });
  }

  const docxName = renderFilename(mapping.filenamePattern, data, "docx");
  const pdfName = docxName.replace(/\.docx$/i, ".pdf");
  const outputFileId = await saveOutput(docx, docxName, DOCX_MIME);

  let pdfFileId: string | undefined;
  let pdfBuffer: Buffer | undefined;
  if (mapping.outputFormat === "pdf" || mapping.outputFormat === "both") {
    pdfBuffer = await convertDocxToPdf(docx);
    pdfFileId = await saveOutput(pdfBuffer, pdfName, PDF_MIME);
  }

  let larkFileToken: string | undefined;
  if (mapping.outputAttachmentFieldName && larkClient.isConfigured()) {
    const filesToUpload: Array<{ fileName: string; buffer: Buffer }> = [];
    if (mapping.outputFormat === "docx" || mapping.outputFormat === "both") {
      filesToUpload.push({ fileName: docxName, buffer: docx });
    }
    if (pdfBuffer) {
      filesToUpload.push({ fileName: pdfName, buffer: pdfBuffer });
    }
    const tokens: string[] = [];
    for (const f of filesToUpload) {
      const token = await larkClient.uploadMedia({
        appToken: mapping.larkAppToken,
        tableId: mapping.larkTableId,
        fileName: f.fileName,
        fileContent: f.buffer,
      });
      tokens.push(token);
    }
    larkFileToken = tokens.join(",");
    await larkClient.updateRecordField({
      appToken: mapping.larkAppToken,
      tableId: mapping.larkTableId,
      recordId: record.record_id,
      fields: { [mapping.outputAttachmentFieldName]: tokens.map((t) => ({ file_token: t })) },
    });
  }

  const delivery = await deliverToWebhook(mapping, record.record_id, docxName, docx, pdfBuffer, pdfName);

  return { fileName: docxName, outputFileId, pdfFileId, larkFileToken, ...delivery };
}

/** Best-effort POST of the generated file(s) to an external service, if configured. */
async function deliverToWebhook(
  mapping: MappingRecord,
  recordId: string,
  docxName: string,
  docx: Buffer,
  pdfBuffer: Buffer | undefined,
  pdfName: string
): Promise<Pick<JobResultItem, "deliveryStatus" | "deliveryError">> {
  if (!mapping.deliveryWebhookUrl) return { deliveryStatus: "skipped" };
  try {
    const files: Array<{ fileName: string; mimeType: string; contentBase64: string }> = [
      { fileName: docxName, mimeType: DOCX_MIME, contentBase64: docx.toString("base64") },
    ];
    if (pdfBuffer) {
      files.push({ fileName: pdfName, mimeType: PDF_MIME, contentBase64: pdfBuffer.toString("base64") });
    }
    await axios.post(
      mapping.deliveryWebhookUrl,
      { recordId, mappingId: mapping.id, files },
      { timeout: 30_000, headers: { "Content-Type": "application/json" } }
    );
    return { deliveryStatus: "sent" };
  } catch (err) {
    return { deliveryStatus: "failed", deliveryError: err instanceof Error ? err.message : String(err) };
  }
}
