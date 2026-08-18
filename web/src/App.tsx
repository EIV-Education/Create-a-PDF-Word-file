import { useState } from "react";
import { useI18n, type Locale } from "./i18n/context";
import { TemplatesPage } from "./pages/Templates";
import { MappingPage } from "./pages/Mapping";
import { GeneratePage } from "./pages/Generate";
import { SettingsPage } from "./pages/Settings";

type Tab = "templates" | "mapping" | "generate" | "settings";

export function App() {
  const { t, locale, setLocale } = useI18n();
  const [tab, setTab] = useState<Tab>("templates");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>{t("app.title")}</strong>
          <span>{t("app.tagline")}</span>
        </div>
        <div className="locale-switch">
          {(["en", "vi"] as Locale[]).map((l) => (
            <button key={l} className={locale === l ? "active" : ""} onClick={() => setLocale(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}>
          {t("nav.templates")}
        </button>
        <button className={tab === "mapping" ? "active" : ""} onClick={() => setTab("mapping")}>
          {t("nav.mapping")}
        </button>
        <button className={tab === "generate" ? "active" : ""} onClick={() => setTab("generate")}>
          {t("nav.generate")}
        </button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          {t("nav.settings")}
        </button>
      </nav>

      <main>
        {tab === "templates" && (
          <TemplatesPage
            onOpenMapping={(id) => {
              setSelectedTemplateId(id);
              setTab("mapping");
            }}
          />
        )}
        {tab === "mapping" && <MappingPage initialTemplateId={selectedTemplateId} />}
        {tab === "generate" && <GeneratePage />}
        {tab === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
