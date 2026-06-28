import { useState } from "react";
import { useTranslation, type Lang } from "@/lib/i18n";
import { toast } from "sonner";
import { Globe, Check } from "lucide-react";

const LANGUAGES: { code: Lang; label: string; native: string; flag: string }[] = [
  { code: "en", label: "English",  native: "English", flag: "🇬🇧" },
  { code: "es", label: "Spanish",  native: "Español", flag: "🇪🇸" },
];

export default function LanguagePage() {
  const { lang, setLang, t } = useTranslation();
  const [selected, setSelected] = useState<Lang>(lang);

  const handleSave = () => {
    setLang(selected);
    toast.success(t("language_saved", "Language saved"));
  };

  return (
    <div className="pb-24 max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-2 pb-2 bg-background/95 backdrop-blur border-b border-border mb-6">
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-orange-700" />
          <h1 className="text-lg font-black">{t("language_title", "Language")}</h1>
        </div>
      </div>


      {/* Language list */}
      <div className="space-y-3">
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground px-1">
          {t("select_language", "Select Language")}
        </p>
        <div className="rounded-2xl border border-border overflow-hidden" style={{ background: "var(--gradient-card)" }}>
          {LANGUAGES.map((l, i) => (
            <label
              key={l.code}
              className={`flex items-center justify-between px-5 py-4 cursor-pointer active:bg-muted/30 transition ${
                i < LANGUAGES.length - 1 ? "border-b border-border/50" : ""
              } ${selected === l.code ? "bg-orange-500/10" : ""}`}
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl">{l.flag}</span>
                <div>
                  <p className="font-black text-base">{l.native}</p>
                  <p className="text-xs text-muted-foreground">{l.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {selected === l.code && (
                  <div className="h-6 w-6 rounded-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
                    <Check className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <input
                  type="radio"
                  name="language"
                  value={l.code}
                  checked={selected === l.code}
                  onChange={() => setSelected(l.code)}
                  className="sr-only"
                />
                <div className={`h-5 w-5 rounded-full border-2 transition ${
                  selected === l.code
                    ? "border-orange-500 bg-orange-500"
                    : "border-muted-foreground bg-transparent"
                }`} />
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Save button — bottom */}
      <button
        onClick={handleSave}
        disabled={selected === lang}
        className="w-full h-12 rounded-2xl font-black text-base text-white mt-6 active:scale-[0.98] transition disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
      >
        {t("save", "Save")}
      </button>
    </div>
  );
}
