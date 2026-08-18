import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { jobsDb } from "../db.js";
import type { JobRecord, JobResultItem } from "../models.js";

/** Fan-out of job progress updates to any open SSE connections. */
const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export function onJobUpdate(jobId: string, handler: (job: JobRecord) => void): () => void {
  emitter.on(jobId, handler);
  return () => emitter.off(jobId, handler);
}

export async function createJob(params: {
  templateId: string;
  mappingId: string;
  source: "manual" | "webhook";
  total: number;
}): Promise<JobRecord> {
  const now = new Date().toISOString();
  const job: JobRecord = {
    id: randomUUID(),
    templateId: params.templateId,
    mappingId: params.mappingId,
    source: params.source,
    status: "pending",
    total: params.total,
    completed: 0,
    failed: 0,
    results: [],
    createdAt: now,
    updatedAt: now,
  };
  await jobsDb.insert(job);
  return job;
}

export async function markRunning(jobId: string): Promise<void> {
  await patchAndNotify(jobId, { status: "running" });
}

export async function appendResult(jobId: string, result: JobResultItem): Promise<void> {
  const job = await jobsDb.get(jobId);
  if (!job) return;
  const results = [...job.results, result];
  const completed = job.completed + (result.status === "success" ? 1 : 0);
  const failed = job.failed + (result.status === "error" ? 1 : 0);
  await patchAndNotify(jobId, { results, completed, failed });
}

export async function finishJob(jobId: string, error?: string): Promise<void> {
  await patchAndNotify(jobId, { status: error ? "failed" : "completed", error });
}

async function patchAndNotify(jobId: string, patch: Partial<JobRecord>): Promise<void> {
  const updated = await jobsDb.update(jobId, { ...patch, updatedAt: new Date().toISOString() } as Partial<JobRecord>);
  if (updated) emitter.emit(jobId, updated);
}
