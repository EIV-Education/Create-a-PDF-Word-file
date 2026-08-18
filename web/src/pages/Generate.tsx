import { useEffect, useState } from "react";
import { api, ApiError, subscribeJob, type Template, type Mapping, type LarkRecordSummary, type Job } from "../api/client";
import { useI18n } from "../i18n/context";

export function GeneratePage() {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [mappingId, setMappingId] = useState("");

  const [records, setRecords] = useState<LarkRecordSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recordsLoading, setRecordsLoading] = useState(false);

  const [job, setJob] = useState<Job | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.listTemplates().then((r) => setTemplates(r.templates));
  }, []);

  useEffect(() => {
    setMappingId("");
    setMappings([]);
    setRecords([]);
    setSelected(new Set());
    if (templateId) void api.listMappings(templateId).then((r) => setMappings(r.mappings));
  }, [templateId]);

  const mapping = mappings.find((m) => m.id === mappingId) ?? null;

  async function loadRecords() {
    if (!mapping) return;
    setRecordsLoading(true);
    setError(null);
    try {
      const { records } = await api.larkRecords(mapping.larkAppToken, mapping.larkTableId);
      setRecords(records);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setRecordsLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === records.length ? new Set() : new Set(records.map((r) => r.recordId))));
  }

  async function run() {
    if (!templateId || !mappingId || selected.size === 0) return;
    setStarting(true);
    setError(null);
    setJob(null);
    try {
      const { job } = await api.generate(templateId, mappingId, [...selected]);
      setJob(job);
      const unsubscribe = subscribeJob(job.id, (updated) => {
        setJob(updated);
        if (updated.status === "completed" || updated.status === "failed") unsubscribe();
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  const progressPct = job && job.total > 0 ? Math.round(((job.completed + job.failed) / job.total) * 100) : 0;

  return (
    <div>
      <h1>{t("generate.heading")}</h1>

      <div className="card">
        <div className="row">
          <div className="field">
            <label>{t("generate.selectTemplate")}</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">--</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("generate.selectMapping")}</label>
            <select value={mappingId} onChange={(e) => setMappingId(e.target.value)} disabled={!templateId}>
              <option value="">--</option>
              {mappings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn secondary" onClick={loadRecords} disabled={!mapping || recordsLoading}>
            {t("generate.loadRecords")}
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>

      {records.length === 0 ? (
        <p className="muted">{t("generate.noRecords")}</p>
      ) : (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="checkbox-row">
              <input type="checkbox" checked={selected.size === records.length} onChange={toggleAll} />
              <label>{t("generate.selectAll")}</label>
              <span className="muted">{t("generate.selectedCount", { count: selected.size, total: records.length })}</span>
            </div>
            <button className="btn" onClick={run} disabled={selected.size === 0 || starting || job?.status === "running"}>
              {starting || job?.status === "running" ? t("generate.running") : t("generate.run")}
            </button>
          </div>

          <div className="list" style={{ maxHeight: 320, overflowY: "auto", marginTop: 12 }}>
            {records.map((r) => (
              <div key={r.recordId} className={`list-item clickable ${selected.has(r.recordId) ? "selected" : ""}`} onClick={() => toggle(r.recordId)}>
                <div className="checkbox-row">
                  <input type="checkbox" checked={selected.has(r.recordId)} readOnly />
                  <span>{r.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {job && (
        <div className="card">
          <h2>{t("generate.progress")}</h2>
          <div className="progress-bar">
            <div style={{ width: `${progressPct}%` }} />
          </div>
          <p className="muted">
            {job.completed + job.failed}/{job.total} · {job.completed} ok · {job.failed} failed
          </p>

          <table>
            <thead>
              <tr>
                <th>Record</th>
                <th>Status</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {job.results.map((r) => (
                <tr key={r.recordId}>
                  <td>{r.recordId}</td>
                  <td>
                    {r.status === "success" ? (
                      <span className="badge success">{t("generate.resultSuccess")}</span>
                    ) : (
                      <span className="badge error" title={r.error}>
                        {t("generate.resultError")}
                      </span>
                    )}
                  </td>
                  <td>
                    {r.outputFileId && (
                      <a href={api.outputUrl(r.outputFileId)} target="_blank" rel="noreferrer">
                        {t("generate.downloadDocx")}
                      </a>
                    )}
                    {r.pdfFileId && (
                      <>
                        {" · "}
                        <a href={api.outputUrl(r.pdfFileId)} target="_blank" rel="noreferrer">
                          {t("generate.downloadPdf")}
                        </a>
                      </>
                    )}
                    {r.error && <span className="error-text"> {r.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
