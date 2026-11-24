"use client";

import type { CitizenRequest } from "@govnav/shared";
import { Building2, Check, Clock, MessageCircleQuestion, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SourceChip } from "@/components/chat/answer-cards";
import { ProcedureIcon } from "@/components/procedure-icon";
import { useI18n } from "@/components/providers/i18n-provider";
import type { ProcedureDetail as Detail } from "@/lib/api";
import { cn } from "@/lib/cn";
import { getOpenRequestFor, touchRequest } from "@/lib/store";

/** Progress ring for the checklist header. */
function Ring({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0" role="img" aria-label={`${pct}%`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="var(--gold)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (pct / 100) * c}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="800" fill="currentColor">
        {pct}%
      </text>
    </svg>
  );
}

export function ProcedureDetailView({ detail, compact = false }: { detail: Detail; compact?: boolean }) {
  const { t, lang } = useI18n();
  const p = detail.procedure;
  const s = detail.summary;
  const [request, setRequest] = useState<CitizenRequest | null>(null);

  useEffect(() => {
    let alive = true;
    void getOpenRequestFor(p.id).then((r) => alive && setRequest(r ?? null));
    return () => {
      alive = false;
    };
  }, [p.id]);

  const checked = request?.checklist ?? {};
  const done = p.requiredDocuments.filter((d) => checked[d.id]).length;
  const pct = Math.round((done / p.requiredDocuments.length) * 100);

  const toggle = async (docId: string) => {
    const next = { ...checked, [docId]: !checked[docId] };
    const saved = await touchRequest(p.id, lang, { checklist: next, status: "checklist" });
    if (saved) setRequest(saved);
  };

  const primary = p.sources.find((x) => x.id === p.verification.sourceRef) ?? p.sources[0];

  return (
    <div className={cn(!compact && "mx-auto max-w-3xl")}>
      <section className="bg-primary-deep px-4 py-5 text-white lg:rounded-b-none">
        <div className="flex items-center gap-4">
          <Ring pct={pct} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-gold uppercase">
              <ProcedureIcon id={p.id} className="size-3.5" />
              {t(`procedures.category.${p.category}` as never)}
            </p>
            <h1 className="text-xl leading-tight font-extrabold">{p.name[lang]}</h1>
            <p className="text-sm text-white/80">{s.office[lang]}</p>
          </div>
        </div>
      </section>

      <div className="space-y-5 px-4 py-5">
        <p className="leading-relaxed">{p.summary[lang]}</p>

        <div className={cn("grid grid-cols-2 gap-2", !compact && "sm:grid-cols-3")}>
          {[
            { icon: Building2, label: t("chat.office"), value: s.office[lang] },
            { icon: Wallet, label: t("chat.fee"), value: (p.fee.short ?? p.fee.text)[lang], green: p.fee.isFree },
            { icon: Clock, label: t("chat.time"), value: (p.processingTime.short ?? p.processingTime.text)[lang] },
          ].map(({ icon: Icon, label, value, green }, i) => (
            <div
              key={label}
              className={cn("min-w-0 rounded-xl bg-surface p-3 ring-1 ring-line", i === 0 && "col-span-2", i === 0 && !compact && "sm:col-span-1")}
            >
              <p className="flex items-center gap-1 text-[0.7rem] font-bold tracking-wide text-muted uppercase">
                <Icon aria-hidden className="size-3.5" />
                {label}
              </p>
              <p className={cn("mt-1 text-sm leading-snug font-bold break-words", green && "text-green")}>{value}</p>
            </div>
          ))}
        </div>

        {(p.fee.short || p.processingTime.short) && (
          <dl className="space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
            {p.fee.short && (
              <div>
                <dt className="font-bold">{t("chat.fee")}</dt>
                <dd className="text-muted">{p.fee.text[lang]}</dd>
              </div>
            )}
            {p.processingTime.short && (
              <div>
                <dt className="font-bold">{t("chat.time")}</dt>
                <dd className="text-muted">{p.processingTime.text[lang]}</dd>
              </div>
            )}
          </dl>
        )}

        <section aria-labelledby={`docs-${p.id}`}>
          <h2 id={`docs-${p.id}`} className="mb-2 flex items-baseline justify-between font-extrabold">
            {t("procedures.whatToBring")}
            <span className="text-sm font-semibold text-green">
              {t("home.continueProgress", { done, total: p.requiredDocuments.length })}
            </span>
          </h2>
          <ul className="space-y-2">
            {p.requiredDocuments.map((d) => {
              const on = Boolean(checked[d.id]);
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => void toggle(d.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl bg-surface p-3 text-left ring-1 transition",
                      on ? "ring-green" : "ring-line hover:ring-primary/30",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ring-2",
                        on ? "bg-green text-white ring-green" : "ring-line",
                      )}
                      aria-hidden
                    >
                      {on && <Check className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{d.name[lang]}</span>
                      {d.conditional && <span className="block text-sm text-muted">{d.conditional[lang]}</span>}
                      {d.note && <span className="block text-sm text-muted">{d.note[lang]}</span>}
                    </span>
                    {d.aiCanPrefill && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold/25 px-2 py-0.5 text-xs font-bold text-primary-deep">
                        <Sparkles aria-hidden className="size-3" />
                        {t("procedures.aiCanPrefill")}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {p.eligibility && (
          <section>
            <h2 className="mb-1 font-extrabold">{t("procedures.eligibility")}</h2>
            <p className="text-muted">{p.eligibility[lang]}</p>
          </section>
        )}

        {p.steps && p.steps.length > 0 && (
          <section>
            <h2 className="mb-2 font-extrabold">{t("procedures.steps")}</h2>
            <ol className="space-y-2">
              {p.steps.map((step, i) => (
                <li key={step.en} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step[lang]}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {primary && (
          <SourceChip
            source={{
              title: primary.title,
              url: primary.url ?? null,
              verifiedAt: p.verification.verifiedAt ?? null,
              verifiedBy: p.verification.verifiedBy ?? null,
              demoData: p.verification.demoData ?? false,
            }}
          />
        )}

        {!compact && p.sources.length > 1 && (
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold text-muted">
              {t("procedures.sources")} ({p.sources.length})
            </summary>
            <ul className="space-y-1">
              {p.sources.map((src) => (
                <li key={src.id}>
                  {src.url ? (
                    <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-primary underline break-words">
                      {src.title}
                    </a>
                  ) : (
                    src.title
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        <Link
          href="/ask"
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-surface-2 font-semibold ring-1 ring-line"
        >
          <MessageCircleQuestion aria-hidden className="size-4" />
          {t("procedures.ask")}
        </Link>
        <p className="text-center text-xs text-muted">{t("app.limits")}</p>
      </div>
    </div>
  );
}
