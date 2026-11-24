"use client";

import { TEXT_SCALES, type TextScale } from "@/i18n/dictionaries";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/cn";

const GLYPH: Record<TextScale, string> = { md: "A", lg: "A+", xl: "A++" };

export function TextSizeControl({ tone = "light", compact = false }: { tone?: "light" | "dark"; compact?: boolean }) {
  const { textScale, setTextScale, t } = useI18n();
  if (compact) {
    // One button that cycles A → A+ → A++ (saves header width on small phones).
    const next = TEXT_SCALES[(TEXT_SCALES.indexOf(textScale) + 1) % TEXT_SCALES.length] ?? "md";
    return (
      <button
        type="button"
        onClick={() => setTextScale(next)}
        aria-label={`${t("textSize.label")}: ${t(`textSize.${textScale}` as const)}`}
        className={cn(
          "min-h-10 min-w-11 rounded-lg px-1.5 text-sm font-bold",
          tone === "dark" ? "text-white ring-1 ring-white/25 hover:bg-white/10" : "text-ink ring-1 ring-line hover:bg-surface-2",
        )}
      >
        {GLYPH[textScale]}
      </button>
    );
  }
  return (
    <div role="radiogroup" aria-label={t("textSize.label")} className="inline-flex gap-1">
      {TEXT_SCALES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={textScale === s}
          aria-label={t(`textSize.${s}` as const)}
          title={t(`textSize.${s}` as const)}
          onClick={() => setTextScale(s)}
          className={cn(
            "min-h-10 min-w-10 rounded-lg px-1.5 text-sm font-bold",
            textScale === s
              ? tone === "dark" ? "bg-white text-primary-deep" : "bg-primary text-white"
              : tone === "dark" ? "text-white/80 hover:bg-white/10" : "text-muted hover:bg-surface-2",
          )}
        >
          {GLYPH[s]}
        </button>
      ))}
    </div>
  );
}
