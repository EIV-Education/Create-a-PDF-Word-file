import { useEffect, useState } from "react";
import { api, type SettingsResponse } from "../api/client";
import { useI18n } from "../i18n/context";

export function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [copied, setCopied] = useState<"key" | "url" | null>(null);

  async function refresh() {
    const data = await api.getSettings();
    setSettings(data);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function regenerate() {
    await api.regenerateApiKey();
    await refresh();
  }

  function copy(text: string, which: "key" | "url") {
    void navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  if (!settings) return <p className="muted">{t("common.loading")}</p>;

  const webhookUrl = `${window.location.origin}${settings.webhookPath}`;

  return (
    <div>
      <h1>{t("settings.heading")}</h1>

      <div className="card">
        <h2>{t("settings.language")}</h2>
        <div className="locale-switch" style={{ width: "fit-content" }}>
          <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>
            English
          </button>
          <button className={locale === "vi" ? "active" : ""} onClick={() => setLocale("vi")}>
            Tiếng Việt
          </button>
        </div>
      </div>

      <div className="card">
        <h2>{t("settings.apiKey")}</h2>
        <p className="muted">{t("settings.apiKeyHelp")}</p>
        <div className="copy-row">
          <code className="key">{settings.apiKey}</code>
          <button className="btn secondary" onClick={() => copy(settings.apiKey, "key")}>
            {copied === "key" ? t("settings.copied") : t("settings.copy")}
          </button>
          <button className="btn secondary" onClick={regenerate}>
            {t("settings.regenerate")}
          </button>
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label>{t("settings.webhookUrl")}</label>
          <div className="copy-row">
            <code className="key">{webhookUrl}</code>
            <button className="btn secondary" onClick={() => copy(webhookUrl, "url")}>
              {copied === "url" ? t("settings.copied") : t("settings.copy")}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>{t("settings.larkStatus")}</h2>
        {settings.larkConfigured ? (
          <span className="badge success">{t("settings.larkConfigured")}</span>
        ) : (
          <p className="error-text">{t("settings.larkNotConfigured")}</p>
        )}
      </div>

      <div className="card">
        <h2>{t("settings.configStore")}</h2>
        {settings.configStoreMode === "lark" ? (
          <>
            <span className="badge success">Lark Base</span>
            <p className="muted">{t("settings.configStoreLark")}</p>
          </>
        ) : (
          <>
            <span className="badge">Local disk</span>
            <p className="muted">{t("settings.configStoreLocal")}</p>
          </>
        )}
      </div>

      <div className="card">
        <h2>{t("settings.pdfStatus")}</h2>
        {settings.pdfConversionAvailable ? (
          <span className="badge success">{t("settings.pdfAvailable")}</span>
        ) : (
          <p className="error-text">{t("settings.pdfUnavailable")}</p>
        )}
      </div>
    </div>
  );
}
