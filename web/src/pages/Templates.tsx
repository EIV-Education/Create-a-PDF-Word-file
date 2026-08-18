import { useEffect, useRef, useState } from "react";
import { api, type Template, ApiError } from "../api/client";
import { useI18n } from "../i18n/context";

export function TemplatesPage({ onOpenMapping }: { onOpenMapping: (templateId: string) => void }) {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const { templates } = await api.listTemplates();
      setTemplates(templates);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadTemplate(file, name || file.name.replace(/\.docx$/i, ""));
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("templates.confirmDelete"))) return;
    await api.deleteTemplate(id);
    await refresh();
  }

  return (
    <div>
      <h1>{t("templates.heading")}</h1>

      <div className="card">
        <h2>{t("templates.upload")}</h2>
        <form onSubmit={handleUpload}>
          <div className="row">
            <div className="field">
              <label>{t("templates.name")}</label>
              <input type="text" placeholder={t("templates.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>{t("templates.chooseFile")}</label>
              <input type="file" accept=".docx" ref={fileRef} required />
            </div>
            <button className="btn" type="submit" disabled={uploading}>
              {uploading ? t("templates.uploading") : t("templates.uploadButton")}
            </button>
          </div>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      {loading ? (
        <p className="muted">{t("common.loading")}</p>
      ) : templates.length === 0 ? (
        <p className="muted">{t("templates.empty")}</p>
      ) : (
        <div className="list">
          {templates.map((tpl) => (
            <div key={tpl.id} className="list-item clickable" onClick={() => onOpenMapping(tpl.id)}>
              <div>
                <strong>{tpl.name}</strong>
                <span className="badge">
                  {tpl.placeholders.length} {t("templates.placeholders")}
                </span>
                <div className="muted">
                  {tpl.originalFilename} · {(tpl.sizeBytes / 1024).toFixed(0)} KB · {t("templates.uploadedAt")}{" "}
                  {new Date(tpl.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="row" onClick={(e) => e.stopPropagation()}>
                <a className="btn secondary" href={api.base + `/templates/${tpl.id}/download`} target="_blank" rel="noreferrer">
                  {t("templates.download")}
                </a>
                <button className="btn danger" onClick={() => handleDelete(tpl.id)}>
                  {t("templates.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
