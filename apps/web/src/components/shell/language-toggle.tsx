"use client";

import { LANGS } from "@/i18n/dictionaries";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/cn";

/** The සිං | த | En switch shown on every screen. */
export function LanguageToggle({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="radiogroup"
      aria-label={t("lang.label")}
      className={cn(
        "inline-flex rounded-full p-1",
        tone === "dark" ? "bg-white/10 ring-1 ring-white/20" : "bg-surface-2 ring-1 ring-line",
      )}
    >
      {LANGS.map((l) => {
        const active = l === lang;
        const full = t(`lang.${l}Full` as const);
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={full}
            lang={l}
            onClick={() => setLang(l)}
            className={cn(
              "min-h-10 min-w-11 rounded-full px-3 text-sm font-semibold transition-colors",
              active
                ? "bg-gold text-ink shadow-sm"
                : tone === "dark"
                  ? "text-white/85 hover:bg-white/10"
                  : "text-muted hover:bg-white",
            )}
          >
            {t(`lang.${l}` as const)}
          </button>
        );
      })}
    </div>
  );
}
