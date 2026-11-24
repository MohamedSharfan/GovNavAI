"use client";

import type { AnswerCard as AnswerCardT, AskResponse, DeclineCard as DeclineCardT } from "@govnav/shared";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CircleAlert,
  Clock,
  ExternalLink,
  MapPin,
  Phone,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/providers/i18n-provider";
import type { Lang } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";

function formatDate(iso: string | null | undefined, lang: Lang): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "en" ? "en-GB" : `${lang}-LK`, { year: "numeric", month: "short", day: "numeric" });
}

export function SourceChip({ source }: { source: AnswerCardT["source"] }) {
  const { t, lang } = useI18n();
  const date = formatDate(source.verifiedAt, lang);
  return (
    <div className="rounded-xl bg-green/8 p-3 text-sm ring-1 ring-green/20">
      <div className="flex items-start gap-2 text-green">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">
            {t("chat.source")}: <span className="font-medium break-words">{source.title}</span>
          </p>
          {date && (
            <p className="text-xs text-green/90">
              {t("chat.verifiedOn", { date })}
              {source.verifiedBy ? ` ${t("chat.verifiedBy", { name: source.verifiedBy })}` : ""}
            </p>
          )}
        </div>
        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("chat.openSource")}
            className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-green/10"
          >
            <ExternalLink aria-hidden className="size-4" />
          </a>
        )}
      </div>
      {source.demoData && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-saffron/12 px-2 py-1 text-xs font-semibold text-saffron-ink">
          <CircleAlert aria-hidden className="size-3.5" />
          {t("chat.sampleData")}
        </p>
      )}
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  accent,
  wide,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  accent?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-surface-2 p-3", wide && "col-span-2 sm:col-span-1")}>
      <p className="flex items-center gap-1 text-[0.7rem] font-bold tracking-wide text-muted uppercase">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </p>
      <p className={cn("mt-1 leading-snug font-bold break-words", accent && "text-green")}>{value}</p>
    </div>
  );
}

export function TraceExpander({ response }: { response: AskResponse }) {
  const { t } = useI18n();
  const card = response.card;
  const grounded = card.kind === "answer" ? card.grounded : null;
  return (
    <details className="group mt-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-muted hover:text-ink">
        <span className="flex flex-wrap items-center gap-1" aria-hidden>
          {response.trace
            .filter((s) => s.agent !== "retriever")
            .map((s, i) => (
              <span key={`${s.agent}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ArrowRight className="size-3" />}
                <span className="rounded-md bg-gold/20 px-1.5 py-0.5 text-[0.7rem] font-bold tracking-wide text-primary-deep">
                  {s.label}
                </span>
              </span>
            ))}
        </span>
        <span className="underline-offset-2 group-open:underline">{t("chat.howMade")}</span>
      </summary>
      <ol className="mt-2 space-y-1.5 rounded-xl bg-surface-2 p-3">
        {response.trace.map((s, i) => (
          <li key={`${s.agent}-${i}`} className="flex gap-2">
            <span className="font-mono text-xs font-bold text-primary">{s.label}</span>
            <span className="min-w-0 flex-1 text-xs break-words text-muted">{s.detail}</span>
            <span className="font-mono text-xs text-muted">{s.ms} ms</span>
          </li>
        ))}
        {grounded !== null && (
          <li className="flex items-center gap-1.5 pt-1 text-xs text-green">
            <BadgeCheck aria-hidden className="size-3.5" />
            {grounded ? t("chat.groundedYes") : t("chat.groundedTemplate")}
          </li>
        )}
        {response.mode === "offline" && <li className="text-xs text-saffron-ink">{t("chat.demoMode")}</li>}
      </ol>
    </details>
  );
}

interface ReadAloudProps {
  onToggle: () => void;
  speaking: boolean;
  supported: boolean;
}

function ReadAloudButton({ onToggle, speaking, supported }: ReadAloudProps) {
  const { t } = useI18n();
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={speaking}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary/5"
    >
      {speaking ? <VolumeX aria-hidden className="size-4" /> : <Volume2 aria-hidden className="size-4" />}
      {speaking ? t("chat.stopReading") : t("chat.readAloud")}
    </button>
  );
}

export function AnswerCard({
  card,
  response,
  readAloud,
}: {
  card: AnswerCardT;
  response: AskResponse;
  readAloud: ReadAloudProps;
}) {
  const { t, lang } = useI18n();
  const answerLang = response.language as Lang;
  return (
    <article className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line" aria-label={card.procedureName}>
      <h3 className="text-lg font-extrabold text-primary" lang={answerLang}>
        {card.procedureName}
      </h3>
      <p className="mt-2 leading-relaxed" lang={answerLang}>
        {card.text}
      </p>
      <div className="mt-1">
        <ReadAloudButton {...readAloud} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" lang={answerLang}>
        <Fact icon={Building2} label={t("chat.office")} value={card.facts.office} wide />
        <Fact icon={Wallet} label={t("chat.fee")} value={card.facts.fee} accent={card.facts.isFree} />
        <Fact icon={Clock} label={t("chat.time")} value={card.facts.time} />
      </div>
      <div className="mt-3">
        <SourceChip source={card.source} />
      </div>
      <Link
        href={`/procedures/${card.procedureId}`}
        className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white hover:bg-primary-strong"
      >
        {t("chat.seeChecklist")}
        <ArrowRight aria-hidden className="size-4" />
      </Link>
      <p className="mt-2 text-center text-xs text-muted">
        {t("chat.documents", { count: card.documentCount })}
        {card.hasForm && ` · ${t("chat.formAvailable")}`}
      </p>
      <TraceExpander response={response} />
      {lang !== answerLang && <span className="sr-only">({answerLang})</span>}
    </article>
  );
}

export function DeclineCard({
  card,
  response,
  onSuggest,
}: {
  card: DeclineCardT;
  response: AskResponse;
  onSuggest: (name: string) => void;
}) {
  const { t } = useI18n();
  return (
    <article className="rounded-2xl bg-surface p-4 ring-1 ring-saffron/40" aria-label={t("chat.declineTitle")}>
      <h3 className="flex items-center gap-2 font-extrabold text-saffron-ink">
        <CircleAlert aria-hidden className="size-5" />
        {t("chat.declineTitle")}
      </h3>
      <p className="mt-2 leading-relaxed" lang={response.language}>
        {card.text}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={`tel:${card.hotline}`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-3 font-semibold text-white"
        >
          <Phone aria-hidden className="size-4" />
          {t("chat.call1919")}
        </a>
        <Link
          href="/offices"
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-surface-2 px-3 text-center font-semibold ring-1 ring-line"
        >
          <MapPin aria-hidden className="size-4" />
          {t("chat.findOffice")}
        </Link>
      </div>
      {card.suggestions && card.suggestions.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-muted">{t("chat.didYouMean")}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {card.suggestions.map((s) => (
              <button
                key={s.procedureId}
                type="button"
                onClick={() => onSuggest(s.name)}
                className="min-h-11 rounded-full bg-surface-2 px-3 text-sm font-semibold ring-1 ring-line hover:ring-primary/40"
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <TraceExpander response={response} />
    </article>
  );
}
