import { useEffect, useMemo, useState } from "react";
import {
  api,
  ApiError,
  type Template,
  type LarkField,
  type Mapping,
  type FieldMappingEntry,
  type MappedFieldKind,
  type OutputFormat,
} from "../api/client";
import { useI18n } from "../i18n/context";

type RowState = { larkFieldId: string; kind: MappedFieldKind };

function defaultKindFor(placeholderKind: string): MappedFieldKind {
  if (placeholderKind === "image") return "image";
  if (placeholderKind === "loop") return "loop";
  return "value";
}

function previewFilename(pattern: string, tags: string[]): string {
  let out = pattern;
  for (const tag of tags) {
    out = out.split(`{${tag}}`).join(`<${tag}>`);
  }
  return out.endsWith(".docx") || out.endsWith(".pdf") ? out : `${out}.docx`;
}

export function MappingPage({ initialTemplateId }: { initialTemplateId: string | null }) {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>(initialTemplateId ?? "");
  const [template, setTemplate] = useState<Template | null>(null);
  const [existingMappings, setExistingMappings] = useState<Mapping[]>([]);
  const [loadedMappingId, setLoadedMappingId] = useState<string>("");

  const [appToken, setAppToken] = useState("");
  const [tableId, setTableId] = useState("");
  const [fields, setFields] = useState<LarkField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);

  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [mappingName, setMappingName] = useState("");
  const [filenamePattern, setFilenamePattern] = useState("");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("docx");
  const [compressImages, setCompressImages] = useState(true);
  const [outputAttachmentFieldId, setOutputAttachmentFieldId] = useState("");
  const [deliveryWebhookUrl, setDeliveryWebhookUrl] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.listTemplates().then((r) => setTemplates(r.templates));
  }, []);

  useEffect(() => {
    if (!templateId) {
      setTemplate(null);
      return;
    }
    void api.getTemplate(templateId).then((r) => {
      setTemplate(r.template);
      setMappingName(r.template.name);
      setFilenamePattern(`${r.template.name} - {${r.template.placeholders[0]?.name ?? "Date"}}`);
    });
    void api.listMappings(templateId).then((r) => setExistingMappings(r.mappings));
  }, [templateId]);

  const placeholders = useMemo(
    () => (template?.placeholders ?? []).filter((p) => p.kind !== "raw"),
    [template]
  );

  function updateRow(tag: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [tag]: { larkFieldId: prev[tag]?.larkFieldId ?? "", kind: prev[tag]?.kind ?? "value", ...patch } }));
  }

  async function loadFields() {
    if (!appToken || !tableId) return;
    setFieldsLoading(true);
    setError(null);
    try {
      const { fields } = await api.larkFields(appToken, tableId);
      setFields(fields);
      // Seed rows with sane defaults so every placeholder shows in the table.
      setRows((prev) => {
        const next = { ...prev };
        for (const p of placeholders) {
          if (!next[p.name]) next[p.name] = { larkFieldId: "", kind: defaultKindFor(p.kind) };
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setFieldsLoading(false);
    }
  }

  async function autoMatch() {
    if (!templateId || !appToken || !tableId) return;
    try {
      const { suggestions, availableFields } = await api.suggestMapping(templateId, appToken, tableId);
      setFields(availableFields);
      setRows((prev) => {
        const next = { ...prev };
        for (const s of suggestions) {
          next[s.tag] = { larkFieldId: s.larkFieldId, kind: s.kind };
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  function loadMapping(m: Mapping) {
    setLoadedMappingId(m.id);
    setAppToken(m.larkAppToken);
    setTableId(m.larkTableId);
    setMappingName(m.name);
    setFilenamePattern(m.filenamePattern);
    setOutputFormat(m.outputFormat);
    setCompressImages(m.compressImages);
    setOutputAttachmentFieldId(m.outputAttachmentFieldId ?? "");
    setDeliveryWebhookUrl(m.deliveryWebhookUrl ?? "");
    const nextRows: Record<string, RowState> = {};
    for (const f of m.fields) nextRows[f.tag] = { larkFieldId: f.larkFieldId, kind: f.kind };
    setRows(nextRows);
  }

  async function handleSave() {
    if (!template) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const fieldEntries: FieldMappingEntry[] = placeholders
        .map((p) => {
          const row = rows[p.name];
          if (!row?.larkFieldId) return null;
          const field = fields.find((f) => f.fieldId === row.larkFieldId);
          if (!field) return null;
          return {
            tag: p.name,
            larkFieldId: field.fieldId,
            larkFieldName: field.fieldName,
            larkFieldType: field.type,
            kind: row.kind,
          };
        })
        .filter((v): v is FieldMappingEntry => v !== null);

      const attachmentField = fields.find((f) => f.fieldId === outputAttachmentFieldId);

      const body: Partial<Mapping> = {
        templateId: template.id,
        name: mappingName,
        larkAppToken: appToken,
        larkTableId: tableId,
        fields: fieldEntries,
        filenamePattern,
        outputFormat,
        compressImages,
        outputAttachmentFieldId: attachmentField?.fieldId,
        outputAttachmentFieldName: attachmentField?.fieldName,
        deliveryWebhookUrl: deliveryWebhookUrl || undefined,
      };

      const result = loadedMappingId ? await api.updateMapping(loadedMappingId, body) : await api.createMapping(body);
      setLoadedMappingId(result.mapping.id);
      setMessage(t("mapping.saved"));
      const { mappings } = await api.listMappings(template.id);
      setExistingMappings(mappings);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const attachmentFields = fields.filter((f) => f.type === 17);

  return (
    <div>
      <h1>{t("mapping.heading")}</h1>

      <div className="card">
        <h2>{t("mapping.selectTemplate")}</h2>
        <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setLoadedMappingId(""); }}>
          <option value="">--</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
        {!templateId && <p className="muted">{t("mapping.needTemplate")}</p>}

        {existingMappings.length > 0 && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>{t("mapping.selectExisting")}</label>
            <select value={loadedMappingId} onChange={(e) => {
              const m = existingMappings.find((x) => x.id === e.target.value);
              if (m) loadMapping(m);
              else setLoadedMappingId("");
            }}>
              <option value="">--</option>
              {existingMappings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {template && (
        <>
          <div className="card">
            <h2>{t("mapping.connectLark")}</h2>
            <div className="row">
              <div className="field">
                <label>{t("mapping.appToken")}</label>
                <input type="text" value={appToken} onChange={(e) => setAppToken(e.target.value)} />
                <span className="help">{t("mapping.appTokenHelp")}</span>
              </div>
              <div className="field">
                <label>{t("mapping.tableId")}</label>
                <input type="text" value={tableId} onChange={(e) => setTableId(e.target.value)} />
                <span className="help">{t("mapping.tableIdHelp")}</span>
              </div>
              <button className="btn secondary" onClick={loadFields} disabled={fieldsLoading || !appToken || !tableId}>
                {t("mapping.loadFields")}
              </button>
              <button className="btn secondary" onClick={autoMatch} disabled={!appToken || !tableId}>
                {t("mapping.autoMatch")}
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
          </div>

          {fields.length > 0 && (
            <div className="card">
              <h2>{t("mapping.mapFields")}</h2>
              <table>
                <thead>
                  <tr>
                    <th>{t("mapping.tag")}</th>
                    <th>{t("mapping.field")}</th>
                    <th>{t("mapping.kind")}</th>
                  </tr>
                </thead>
                <tbody>
                  {placeholders.map((p) => (
                    <tr key={`${p.kind}-${p.name}`}>
                      <td><code>{p.raw}</code></td>
                      <td>
                        <select
                          value={rows[p.name]?.larkFieldId ?? ""}
                          onChange={(e) => updateRow(p.name, { larkFieldId: e.target.value })}
                        >
                          <option value="">{t("mapping.none")}</option>
                          {fields.map((f) => (
                            <option key={f.fieldId} value={f.fieldId}>
                              {f.fieldName} ({f.typeLabel})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={rows[p.name]?.kind ?? defaultKindFor(p.kind)}
                          onChange={(e) => updateRow(p.name, { kind: e.target.value as MappedFieldKind })}
                        >
                          <option value="value">{t("mapping.kind.value")}</option>
                          <option value="image">{t("mapping.kind.image")}</option>
                          <option value="loop">{t("mapping.kind.loop")}</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <h2>{t("mapping.options")}</h2>
            <div className="field">
              <label>{t("mapping.mappingName")}</label>
              <input type="text" value={mappingName} onChange={(e) => setMappingName(e.target.value)} />
            </div>
            <div className="field">
              <label>{t("mapping.filenamePattern")}</label>
              <input type="text" value={filenamePattern} onChange={(e) => setFilenamePattern(e.target.value)} style={{ minWidth: 360 }} />
              <span className="help">
                {t("mapping.filenamePreview")}: {previewFilename(filenamePattern, placeholders.map((p) => p.name))}
              </span>
            </div>
            <div className="row">
              <div className="field">
                <label>{t("mapping.outputFormat")}</label>
                <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}>
                  <option value="docx">{t("mapping.format.docx")}</option>
                  <option value="pdf">{t("mapping.format.pdf")}</option>
                  <option value="both">{t("mapping.format.both")}</option>
                </select>
              </div>
              <div className="checkbox-row" style={{ marginBottom: 12 }}>
                <input type="checkbox" id="compress" checked={compressImages} onChange={(e) => setCompressImages(e.target.checked)} />
                <label htmlFor="compress">{t("mapping.compressImages")}</label>
              </div>
            </div>
            <div className="field">
              <label>{t("mapping.writeBack")}</label>
              <select value={outputAttachmentFieldId} onChange={(e) => setOutputAttachmentFieldId(e.target.value)}>
                <option value="">{t("mapping.writeBackNone")}</option>
                {attachmentFields.map((f) => (
                  <option key={f.fieldId} value={f.fieldId}>
                    {f.fieldName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t("mapping.deliveryWebhook")}</label>
              <input
                type="url"
                placeholder="https://example.com/hooks/receive-document"
                value={deliveryWebhookUrl}
                onChange={(e) => setDeliveryWebhookUrl(e.target.value)}
                style={{ minWidth: 360 }}
              />
            </div>

            <button className="btn" onClick={handleSave} disabled={saving || !mappingName}>
              {t("mapping.save")}
            </button>
            {message && <p className="success-text">{message}</p>}
          </div>
        </>
      )}
    </div>
  );
}
