"use client";

import type { FillPlan, FillPlanField, Profile } from "@govnav/shared";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Download,
  FileText,
  LoaderCircle,
  Lock,
  PenLine,
  Printer,
  QrCode,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { PdfPreview } from "@/components/form/pdf-preview";
import { useI18n } from "@/components/providers/i18n-provider";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { getOpenRequestFor, getProfile, touchRequest } from "@/lib/store";

type Stage =
  | { kind: "loading" }
  | { kind: "no-form" }
  | { kind: "need-profile" }
  | { kind: "error" }
  | { kind: "edit"; plan: FillPlan }
  | { kind: "preparing"; plan: FillPlan }
  | { kind: "ready"; plan: FillPlan; pdf: Blob; pct: number };

const FILLABLE = new Set(["auto", "confirm", "input", "missing"]);

/** Same rule as the server's planner.filled_percentage (officer sections never count). */
export function filledPct(fields: FillPlanField[], values: Record<string, string>): number {
  const countable = fields.filter((f) => f.status !== "officer" && (!f.optional || values[f.id]?.trim()));
  if (!countable.length) return 0;
  const done = countable.filter((f) => f.status !== "manual" && values[f.id]?.trim()).length;
  return Math.round((100 * done) / countable.length);
}

export function FormView({ procedureId, formIds }: { procedureId: string; formIds: string[] }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [values, setValues] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmAll, setConfirmAll] = useState(false);
  const [formId, setFormId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const load = useCallback(async () => {
    const profile: Profile | undefined = await getProfile();
    if (!profile?.consentAt || !(profile.fullNameEn || profile.fullNameSi || profile.fullNameTa)) {
      setStage({ kind: "need-profile" });
      return;
    }
    // The first of the procedure's forms that has a reviewed form map.
    let chosen: string | null = null;
    for (const id of formIds) {
      try {
        await api.form(id);
        chosen = id;
        break;
      } catch {
        /* no map yet for this form */
      }
    }
    if (!chosen) {
      setStage({ kind: "no-form" });
      return;
    }
    setFormId(chosen);
    const request = await getOpenRequestFor(procedureId);
    try {
      const plan = await api.planForm(chosen, {
        profile,
        language: lang,
        purposeHint: request?.purpose ?? null,
        inputs: request?.filledValues ?? {},
      });
      const initial: Record<string, string> = {};
      plan.fields.forEach((f) => f.value && (initial[f.id] = f.value));
      setValues(initial);
      setChecked(new Set());
      setConfirmAll(false);
      setStage({ kind: "edit", plan });
    } catch {
      setStage({ kind: "error" });
    }
  }, [formIds, lang, procedureId]);

  useEffect(() => {
    // Deferred so state updates happen after mount, not in the effect body.
    queueMicrotask(() => void load());
  }, [load]);

  const plan = stage.kind === "edit" || stage.kind === "preparing" || stage.kind === "ready" ? stage.plan : null;
  const fields = useMemo(() => plan?.fields ?? [], [plan]);
  const pct = filledPct(fields, values);
  const needsCheck = fields.filter((f) => f.status === "confirm" && values[f.id]?.trim() && !checked.has(f.id));
  const autoCount = fields.filter((f) => f.status === "auto" && f.source !== "citizen").length;
  const citizenCount = fields.filter((f) => f.status !== "officer" && f.status !== "manual").length;
  const officerCount = fields.filter((f) => f.status === "officer").length;

  const setValue = (id: string, v: string) => {
    setValues((s) => ({ ...s, [id]: v }));
    setChecked((s) => new Set(s).add(id)); // the citizen wrote it: counts as checked
  };

  const preview = async () => {
    if (!plan || !formId) return;
    setStage({ kind: "preparing", plan });
    const printable = Object.fromEntries(
      fields
        .filter((f) => FILLABLE.has(f.status) && values[f.id]?.trim())
        .map((f) => [f.id, values[f.id]!.trim()]),
    );
    try {
      const pdf = await api.fillForm(formId, printable);
      const inputs = Object.fromEntries(fields.filter((f) => f.status === "input" || f.source === "citizen").map((f) => [f.id, values[f.id] ?? ""]));
      await touchRequest(procedureId, lang, {
        formId,
        formFilledPct: pct,
        manualSteps: plan.manualSteps ?? [],
        filledValues: inputs, // kept on this phone only, to resume later
        status: "form_ready",
      });
      setPdfUrl(URL.createObjectURL(pdf));
      setStage({ kind: "ready", plan, pdf, pct });
    } catch {
      setStage({ kind: "error" });
    }
  };

  if (stage.kind === "loading")
    return (
      <p className="flex items-center gap-2 p-6 text-muted" role="status">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        {t("common.loading")}
      </p>
    );
  if (stage.kind === "no-form") return <p className="p-6">{t("form.noForm")}</p>;
  if (stage.kind === "error")
    return (
      <div className="p-6" role="alert">
        <p>{t("form.error")}</p>
        <button type="button" onClick={() => void load()} className="mt-3 min-h-12 rounded-xl bg-primary px-4 font-semibold text-white">
          {t("chat.retry")}
        </button>
      </div>
    );
  if (stage.kind === "need-profile")
    return (
      <div className="mx-auto max-w-xl px-4 py-8 text-center">
        <UserRound aria-hidden className="mx-auto size-10 text-primary" />
        <p className="mt-3 text-lg">{t("form.needProfile")}</p>
        <Link href="/profile" className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-primary px-5 font-semibold text-white">
          {t("form.addProfile")}
        </Link>
      </div>
    );

  const p = stage.plan;

  // ---- Ready to print ------------------------------------------------------------
  if (stage.kind === "ready") {
    const url = pdfUrl ?? "";
    const markers = p.fields
      .filter((f) => f.status === "manual")
      .map((f) => ({ field: f, label: f.number ? `${f.number}` : f.label[lang] }));
    return (
      <div className="min-h-dvh bg-primary-deep pb-6 text-white">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStage({ kind: "edit", plan: p })}
              className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              <ArrowLeft aria-hidden className="size-4" />
              {t("form.back")}
            </button>
            <h1 className="text-lg font-extrabold">{t("form.readyTitle")}</h1>
            <span className="rounded-full bg-green px-3 py-1 text-sm font-bold">{t("form.filledBadge", { pct: stage.pct })}</span>
          </div>
          <div className="mt-4">
            <PdfPreview pdf={stage.pdf} markers={markers} fallback={t("form.previewFallback")} />
          </div>
          {p.manualSteps && p.manualSteps.length > 0 && (
            <ul className="mt-4 space-y-2">
              {p.manualSteps.map((s) => (
                <li key={s.en} className="flex items-start gap-2 rounded-xl bg-saffron/90 p-3 text-sm font-semibold">
                  <PenLine aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {s[lang]}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
            <button
              type="button"
              aria-label={t("form.print")}
              onClick={() => window.open(url, "_blank", "noopener")}
              className="flex size-14 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/25"
            >
              <Printer aria-hidden className="size-5" />
            </button>
            <a
              href={url}
              download={`${p.formId}-filled.pdf`}
              className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-gold text-lg font-bold text-ink"
            >
              <Download aria-hidden className="size-5" />
              {t("form.download")}
            </a>
          </div>
          <Link
            href={`/visit-pack/${procedureId}`}
            className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white/10 font-semibold ring-1 ring-white/25"
          >
            <QrCode aria-hidden className="size-5" />
            {t("form.visitPack")}
          </Link>
          <p className="mt-4 text-center text-xs text-white/70">{t("app.limits")}</p>
        </div>
      </div>
    );
  }

  // ---- Edit / confirm ------------------------------------------------------------
  const renderField = (f: FillPlanField) => {
    const id = `${uid}-${f.id}`;
    const v = values[f.id] ?? "";
    const isChecked = checked.has(f.id);
    const tone =
      f.status === "manual"
        ? "border-2 border-dashed border-saffron bg-saffron/8"
        : f.status === "confirm" && v && !isChecked
          ? "bg-gold/15 ring-2 ring-gold"
          : f.status === "missing" && !v
            ? "bg-surface ring-2 ring-saffron/60"
            : (f.status === "auto" && f.source !== "citizen") || (f.status === "confirm" && isChecked)
              ? "bg-green/6 ring-1 ring-green/40"
              : "bg-surface ring-1 ring-line";
    return (
      <li key={f.id} className={cn("rounded-2xl p-3", tone)}>
        <label htmlFor={id} className="flex items-start justify-between gap-2 text-xs font-bold tracking-wide text-muted uppercase">
          <span>
            {f.number && <span className="mr-1 text-primary">{f.number}.</span>}
            {f.label[lang]}
          </span>
          {f.optional && <span className="shrink-0 font-semibold normal-case">{t("form.optional")}</span>}
        </label>
        {f.status === "manual" ? (
          <p className="mt-1 flex items-start gap-1.5 font-semibold text-saffron-ink">
            <PenLine aria-hidden className="mt-0.5 size-4 shrink-0" />
            {f.hint?.[lang] ?? t("form.byHand")}
          </p>
        ) : (
          <>
            {f.type === "multiline" ? (
              <textarea
                id={id}
                rows={2}
                value={v}
                maxLength={f.maxChars ?? 400}
                placeholder={t("form.typeHere")}
                onChange={(e) => setValue(f.id, e.target.value)}
                className="mt-1 w-full rounded-lg bg-white/70 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-gold"
              />
            ) : (
              <input
                id={id}
                value={v}
                maxLength={f.maxChars ?? 400}
                placeholder={t("form.typeHere")}
                inputMode={f.type === "nic" ? "text" : f.id.includes("income") || f.id.startsWith("total") ? "decimal" : undefined}
                onChange={(e) => setValue(f.id, e.target.value)}
                className={cn(
                  "mt-1 min-h-12 w-full rounded-lg bg-white/70 px-3 text-base focus:outline-none focus:ring-2 focus:ring-gold",
                  f.type === "nic" && "font-mono",
                )}
              />
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              {f.status === "auto" && f.source !== "citizen" && (
                <span className="flex items-center gap-1 font-semibold text-green">
                  <Lock aria-hidden className="size-3" />
                  {t("form.fromProfile")}
                </span>
              )}
              {f.status === "missing" && !v && (
                <Link href="/profile" className="flex min-h-9 items-center gap-1 font-semibold text-saffron-ink underline">
                  <CircleAlert aria-hidden className="size-3.5" />
                  {t("form.missing")} · {t("form.editProfile")}
                </Link>
              )}
              {f.status === "confirm" && v && (
                isChecked ? (
                  <span className="flex items-center gap-1 font-semibold text-green">
                    <Check aria-hidden className="size-3.5" />
                    {t("form.checked")}
                  </span>
                ) : (
                  <>
                    <span className="flex items-center gap-1 font-semibold text-primary-deep">
                      <Sparkles aria-hidden className="size-3.5" />
                      {t("form.checkThis")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setChecked((s) => new Set(s).add(f.id))}
                      className="ml-auto min-h-10 rounded-lg bg-green px-3 font-bold text-white"
                    >
                      {t("form.looksRight")}
                    </button>
                  </>
                )
              )}
              {f.hint && <span className="w-full text-muted">{f.hint[lang]}</span>}
            </div>
          </>
        )}
      </li>
    );
  };

  const visible = p.fields.filter((f) => f.status !== "officer");
  const mainFields = visible.filter((f) => !f.optional || values[f.id]?.trim());
  const optionalFields = visible.filter((f) => f.optional && !values[f.id]?.trim());
  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <h1 className="sr-only">{t("form.title")}</h1>
      {/* Form locator card */}
      <section className="flex gap-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
        <span className="flex h-20 w-16 shrink-0 flex-col items-center justify-end rounded-lg bg-primary-deep pb-2 text-xs font-bold text-gold">
          <FileText aria-hidden className="mb-2 size-6 text-white" />
          PDF
        </span>
        <div className="min-w-0">
          <p className="font-extrabold">
            {p.code} · {p.name[lang]}
          </p>
          <p className="text-sm text-muted" lang={lang === "si" ? "en" : "si"}>
            {p.name[lang === "si" ? "en" : "si"]}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
            {p.verifiedYear && (
              <span className="flex items-center gap-1 rounded-full bg-green/12 px-2 py-0.5 text-green">
                <ShieldCheck aria-hidden className="size-3" />
                {t("form.verified", { year: p.verifiedYear }).toUpperCase()}
              </span>
            )}
            <span className="rounded-full bg-surface-2 px-2 py-0.5">{t("form.pages", { count: p.pageCount })}</span>
            {p.demoData && <span className="rounded-full bg-saffron/15 px-2 py-0.5 text-saffron-ink">{t("chat.sampleData")}</span>}
          </div>
          {formId && (
            <a href={api.blankFormUrl(formId)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-primary underline">
              {t("form.openBlank")}
            </a>
          )}
        </div>
      </section>

      <div className="mt-5 mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold tracking-wide text-muted uppercase">{t("form.autofill")}</h2>
        <span className="text-sm font-semibold text-green">{t("form.autofilled", { done: autoCount, total: citizenCount })}</span>
      </div>

      <ul className="space-y-2.5">
        {mainFields.map((f) => renderField(f))}
      </ul>
      {optionalFields.length > 0 && (
        <details className="mt-3 rounded-2xl bg-surface-2 p-3">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            {t("form.optional")} ({optionalFields.length})
          </summary>
          <ul className="mt-2 space-y-2.5">{optionalFields.map((f) => renderField(f))}</ul>
        </details>
      )}

      {officerCount > 0 && (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-surface-2 p-3 text-sm text-muted">
          <ShieldCheck aria-hidden className="size-4" />
          {t("form.officerOnly", { count: officerCount })}
        </p>
      )}

      <div className="sticky bottom-16 mt-5 rounded-2xl bg-bg/95 pt-2 pb-3 backdrop-blur lg:bottom-0">
        <label className="flex min-h-12 items-start gap-3 rounded-xl bg-surface p-3 ring-1 ring-line">
          <input
            type="checkbox"
            checked={confirmAll}
            onChange={(e) => setConfirmAll(e.target.checked)}
            className="mt-0.5 size-6 accent-green"
          />
          <span className="text-sm font-semibold">{t("form.confirmAll")}</span>
        </label>
        {needsCheck.length > 0 && <p className="mt-2 text-sm font-semibold text-saffron-ink">{t("form.confirmFirst")}</p>}
        <button
          type="button"
          disabled={!confirmAll || needsCheck.length > 0 || stage.kind === "preparing"}
          onClick={() => void preview()}
          className="mt-2 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary-deep text-lg font-bold text-white disabled:opacity-50"
        >
          {stage.kind === "preparing" ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : null}
          {stage.kind === "preparing" ? t("form.preparing") : `${t("form.preview")} · ${pct}%`}
        </button>
      </div>
    </div>
  );
}
