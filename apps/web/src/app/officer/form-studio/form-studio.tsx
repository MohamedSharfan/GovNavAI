"use client";

import type { FieldType, FillMode, FormField, FormMap, ProfileKey } from "@govnav/shared";
import { CheckCircle2, ChevronLeft, ChevronRight, FilePlus2, KeyRound, LoaderCircle, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PdfPage } from "@/components/form/pdf-page";
import { useI18n } from "@/components/providers/i18n-provider";
import type { MessageKey } from "@/i18n/dictionaries";
import { api, ApiError, type ProcedureSummary } from "@/lib/api";
import { moveBox, newBox, resizeBox, slugify, type Box } from "@/lib/bbox";
import { cn } from "@/lib/cn";
import { officerApi, officerToken, type FormListItem } from "@/lib/officer-api";

const TYPES: FieldType[] = ["text", "multiline", "date", "nic", "phone", "checkbox", "signature"];
const MODES: { value: FillMode; label: MessageKey }[] = [
  { value: "auto", label: "studio.modeAuto" },
  { value: "confirm", label: "studio.modeConfirm" },
  { value: "input", label: "studio.modeInput" },
  { value: "manual", label: "studio.modeManual" },
  { value: "officer", label: "studio.modeOfficer" },
];
const KEYS: ProfileKey[] = [
  "fullName", "fullNameEn", "fullNameSi", "fullNameTa", "nameWithInitials", "nic", "dateOfBirth", "gender",
  "address", "gnDivisionName", "gnDivisionCode", "dsDivision", "district", "phone", "occupation", "civilStatus",
  "purpose", "today",
];
const MODE_COLOUR: Record<FillMode, string> = {
  auto: "border-green bg-green/15",
  confirm: "border-gold bg-gold/20",
  input: "border-primary bg-primary/10",
  manual: "border-saffron bg-saffron/15 border-dashed",
  officer: "border-muted bg-muted/15",
};

type Source = { kind: "pdf"; data: ArrayBuffer } | { kind: "image"; url: string };
type Drag = { id: string; mode: "move" | "resize"; startX: number; startY: number; start: Box; w: number; h: number };

function blankForm(): FormMap {
  return {
    id: "new-form",
    code: "",
    name: { en: "", si: "", ta: "" },
    procedureIds: [],
    pdfPath: "",
    pageCount: 1,
    pageSizes: [{ width: 595, height: 842 }],
    verifiedYear: new Date().getFullYear(),
    language: ["si"],
    fields: [],
    sources: [
      { id: "official-form", title: "Official form", kind: "form", retrievedAt: new Date().toISOString().slice(0, 10) },
    ],
    verification: { status: "approved", sourceRef: "official-form", verifiedBy: "", verifiedAt: new Date().toISOString().slice(0, 10) },
  } as unknown as FormMap;
}

export function FormStudio() {
  const { t } = useI18n();
  const uid = useId();
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenError, setTokenError] = useState(false);
  const [form, setForm] = useState<FormMap | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [existing, setExisting] = useState<FormListItem[]>([]);
  const [procedures, setProcedures] = useState<ProcedureSummary[]>([]);
  const drag = useRef<Drag | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = officerToken.get();
    if (saved) queueMicrotask(() => setToken(saved));
    void officerApi.list().then(setExisting);
    void api.procedures().then((r) => setProcedures(r.items)).catch(() => undefined);
  }, []);

  const signIn = async () => {
    const ok = await officerApi.check(tokenInput);
    if (!ok) return setTokenError(true);
    officerToken.set(tokenInput);
    setToken(tokenInput);
  };

  const updateField = useCallback((id: string, patch: Partial<FormField>) => {
    setForm((f) => (f ? { ...f, fields: f.fields.map((x) => (x.id === id ? { ...x, ...patch } : x)) } : f));
  }, []);

  // ---- pointer drag (move / resize) on the overlay ------------------------------------
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / d.w;
      const dy = (e.clientY - d.startY) / d.h;
      updateField(d.id, { bbox: d.mode === "move" ? moveBox(d.start, dx, dy) : resizeBox(d.start, dx, dy) });
    };
    const onUp = () => (drag.current = null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [updateField]);

  const startDrag = (e: ReactPointerEvent, field: FormField, mode: Drag["mode"]) => {
    e.stopPropagation();
    e.preventDefault();
    setSelected(field.id);
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { id: field.id, mode, startX: e.clientX, startY: e.clientY, start: field.bbox, w: rect.width, h: rect.height };
  };

  // ---- loading a form -------------------------------------------------------------
  const onUpload = async (f: File | undefined) => {
    if (!f || !token) return;
    setFile(f);
    setNotice(null);
    setSelected(null);
    setPage(0);
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    setSource(isPdf ? { kind: "pdf", data: await f.arrayBuffer() } : { kind: "image", url: URL.createObjectURL(f) });
    const draft = blankForm();
    setBusy("studio.detecting");
    try {
      const det = await officerApi.detect(f, token);
      setForm({
        ...draft,
        name: det.title,
        code: det.code ?? "",
        id: slugify(det.title.en || "new-form", new Set(existing.map((x) => x.id))),
        pageCount: det.pageCount,
        pageSizes: det.pageSizes as FormMap["pageSizes"],
        fields: det.fields,
      });
    } catch (e) {
      setForm(draft);
      if (e instanceof ApiError && e.kind === "unavailable") setNotice({ tone: "warn", text: t("studio.detectUnavailable") });
      else setNotice({ tone: "warn", text: t("form.error") });
    } finally {
      setBusy(null);
    }
  };

  const openExisting = async (id: string) => {
    setNotice(null);
    setSelected(null);
    setPage(0);
    setFile(null);
    const [map, pdf] = await Promise.all([officerApi.get(id), officerApi.blankPdf(id)]);
    setForm(map);
    setSource({ kind: "pdf", data: pdf });
  };

  const onPageCount = useCallback(
    (n: number) => setForm((f) => (f && f.pageCount !== n ? { ...f, pageCount: n, pageSizes: Array.from({ length: n }, () => f.pageSizes[0] ?? { width: 595, height: 842 }) as FormMap["pageSizes"] } : f)),
    [],
  );

  const addField = () => {
    if (!form) return;
    const id = slugify(`field ${form.fields.length + 1}`, new Set(form.fields.map((f) => f.id)));
    const field = { id, label: { en: "New field", si: "නව ක්ෂේත්‍රය", ta: "புதிய புலம்" }, page, bbox: newBox(), type: "text", fillMode: "input", script: "as_profile", optional: false } as FormField;
    setForm({ ...form, fields: [...form.fields, field] });
    setSelected(id);
  };

  const check = async (): Promise<boolean> => {
    if (!form || !token) return false;
    const res = await officerApi.validate(form, token);
    setNotice(
      res.ok
        ? { tone: "ok", text: t("studio.valid") }
        : { tone: "warn", text: res.errors.map((e) => `${e.loc.join(".")}: ${e.msg}`).join(" · ") },
    );
    return res.ok;
  };

  const publish = async () => {
    if (!form || !token) return;
    setBusy("studio.publish");
    try {
      const stamped = {
        ...form,
        verification: { ...form.verification, status: "approved" as const, verifiedAt: new Date().toISOString().slice(0, 10) },
      };
      if (!(await check())) return;
      await officerApi.publish(stamped, file, token);
      setNotice({ tone: "ok", text: t("studio.published") });
      setExisting(await officerApi.list());
    } catch (e) {
      const detail = (e as { detail?: unknown }).detail;
      setNotice({ tone: "warn", text: typeof detail === "string" ? detail : t("form.error") });
    } finally {
      setBusy(null);
    }
  };

  // ---- render ---------------------------------------------------------------------
  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-extrabold">{t("studio.title")}</h1>
        <p className="mt-1 text-muted">{t("studio.subtitle")}</p>
        <form
          className="mt-6 rounded-2xl bg-surface p-5 ring-1 ring-line"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
          <label htmlFor={`${uid}-tok`} className="flex items-center gap-2 font-bold">
            <KeyRound aria-hidden className="size-4" />
            {t("studio.token")}
          </label>
          <input
            id={`${uid}-tok`}
            type="password"
            value={tokenInput}
            onChange={(e) => {
              setTokenInput(e.target.value);
              setTokenError(false);
            }}
            className="mt-2 min-h-12 w-full rounded-lg bg-surface-2 px-3 focus:outline-none focus:ring-2 focus:ring-gold"
          />
          <p className="mt-1 text-xs text-muted">{t("studio.tokenHint")}</p>
          {tokenError && <p role="alert" className="mt-2 text-sm font-semibold text-primary">{t("studio.unauthorized")}</p>}
          <button type="submit" className="mt-4 min-h-12 w-full rounded-xl bg-primary font-semibold text-white">
            {t("studio.signIn")}
          </button>
        </form>
      </div>
    );
  }

  const sel = form?.fields.find((f) => f.id === selected) ?? null;
  const input = "mt-1 min-h-10 w-full rounded-lg bg-surface-2 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold";

  return (
    <div className="px-4 py-5 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t("studio.title")}</h1>
          <p className="text-muted">{t("studio.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white">
            <Upload aria-hidden className="size-4" />
            {t("studio.upload")}
            <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => void onUpload(e.target.files?.[0])} />
          </label>
          <select
            aria-label={t("studio.openExisting")}
            value=""
            onChange={(e) => e.target.value && void openExisting(e.target.value)}
            className="min-h-12 rounded-xl bg-surface px-3 font-semibold ring-1 ring-line"
          >
            <option value="">{t("studio.openExisting")}</option>
            {existing.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} · {f.name.en}
              </option>
            ))}
          </select>
        </div>
      </div>

      {busy && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-gold/15 p-3 font-semibold" role="status">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {t(busy)}
        </p>
      )}
      {notice && (
        <p role="status" className={cn("mt-4 flex items-start gap-2 rounded-xl p-3 text-sm font-semibold", notice.tone === "ok" ? "bg-green/10 text-green" : "bg-saffron/12 text-saffron-ink")}>
          {notice.tone === "ok" ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0" />}
          {notice.text}
        </p>
      )}

      {!form || !source ? (
        <div className="mt-10 flex flex-col items-center gap-2 text-center text-muted">
          <FilePlus2 aria-hidden className="size-10" />
          <p>{t("studio.subtitle")}</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Canvas + overlay */}
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button type="button" aria-label="previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="flex size-11 items-center justify-center rounded-lg ring-1 ring-line disabled:opacity-40">
                  <ChevronLeft aria-hidden className="size-4" />
                </button>
                <span className="px-2 text-sm font-semibold">{t("studio.page", { n: page + 1, total: form.pageCount })}</span>
                <button type="button" aria-label="next page" disabled={page >= form.pageCount - 1} onClick={() => setPage((p) => p + 1)} className="flex size-11 items-center justify-center rounded-lg ring-1 ring-line disabled:opacity-40">
                  <ChevronRight aria-hidden className="size-4" />
                </button>
              </div>
              <span className="text-sm text-muted">{t("studio.fields", { count: form.fields.length })}</span>
              <button type="button" onClick={addField} className="flex min-h-11 items-center gap-1 rounded-xl bg-surface px-3 font-semibold ring-1 ring-line">
                <Plus aria-hidden className="size-4" />
                {t("studio.addField")}
              </button>
            </div>
            <p className="mb-2 text-xs text-muted">{t("studio.selectHint")}</p>
            <div className="mx-auto max-w-[820px]">
              <PdfPage source={source} page={page} onPageCount={source.kind === "pdf" ? onPageCount : undefined}>
                <div ref={overlayRef} className="absolute inset-0" onPointerDown={() => setSelected(null)}>
                  {form.fields
                    .filter((f) => f.page === page)
                    .map((f) => (
                      <div
                        key={f.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${f.number ?? ""} ${f.label.en}`}
                        aria-pressed={selected === f.id}
                        onPointerDown={(e) => startDrag(e, f, "move")}
                        onKeyDown={(e) => {
                          const step = e.shiftKey ? 0.01 : 0.002;
                          const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                          const m = moves[e.key];
                          if (m) {
                            e.preventDefault();
                            updateField(f.id, { bbox: moveBox(f.bbox, m[0], m[1]) });
                          }
                        }}
                        className={cn(
                          "absolute cursor-move rounded-sm border-2",
                          MODE_COLOUR[f.fillMode],
                          selected === f.id && "outline outline-2 outline-offset-1 outline-primary",
                        )}
                        style={{ left: `${f.bbox.x * 100}%`, top: `${f.bbox.y * 100}%`, width: `${f.bbox.w * 100}%`, height: `${f.bbox.h * 100}%` }}
                      >
                        <span className="pointer-events-none absolute -top-4 left-0 max-w-full truncate rounded bg-ink/80 px-1 text-[0.6rem] font-bold text-white">
                          {f.number ? `${f.number} ` : ""}
                          {f.label.en}
                        </span>
                        <span
                          onPointerDown={(e) => startDrag(e, f, "resize")}
                          className="absolute -right-1.5 -bottom-1.5 size-3 cursor-se-resize rounded-sm bg-primary"
                          aria-hidden
                        />
                      </div>
                    ))}
                </div>
              </PdfPage>
            </div>
          </section>

          {/* Properties */}
          <aside className="space-y-4">
            {sel && (
              <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
                <h2 className="font-extrabold">{t("studio.fieldProps")}: <span className="font-mono text-sm">{sel.id}</span></h2>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <label className="col-span-2">
                    {t("studio.labelEn")}
                    <input className={input} value={sel.label.en} onChange={(e) => updateField(sel.id, { label: { ...sel.label, en: e.target.value } })} />
                  </label>
                  <label className="col-span-2">
                    {t("studio.labelSi")}
                    <input className={input} lang="si" value={sel.label.si} onChange={(e) => updateField(sel.id, { label: { ...sel.label, si: e.target.value } })} />
                  </label>
                  <label className="col-span-2">
                    {t("studio.labelTa")}
                    <input className={input} lang="ta" value={sel.label.ta} onChange={(e) => updateField(sel.id, { label: { ...sel.label, ta: e.target.value } })} />
                  </label>
                  <label>
                    {t("studio.number")}
                    <input className={input} value={sel.number ?? ""} onChange={(e) => updateField(sel.id, { number: e.target.value || null })} />
                  </label>
                  <label>
                    {t("studio.type")}
                    <select className={input} value={sel.type ?? "text"} onChange={(e) => updateField(sel.id, { type: e.target.value as FieldType })}>
                      {TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </label>
                  <label className="col-span-2">
                    {t("studio.fillMode")}
                    <select className={input} value={sel.fillMode} onChange={(e) => updateField(sel.id, { fillMode: e.target.value as FillMode })}>
                      {MODES.map((m) => <option key={m.value} value={m.value}>{t(m.label)}</option>)}
                    </select>
                  </label>
                  <label className="col-span-2">
                    {t("studio.profileKey")}
                    <select className={input} value={sel.profileKey ?? ""} onChange={(e) => updateField(sel.id, { profileKey: (e.target.value || null) as ProfileKey | null })}>
                      <option value="">{t("studio.none")}</option>
                      {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </label>
                  <label className="col-span-2 flex min-h-11 items-center gap-2">
                    <input type="checkbox" className="size-5" checked={Boolean(sel.optional)} onChange={(e) => updateField(sel.id, { optional: e.target.checked })} />
                    {t("studio.optional")}
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForm({ ...form, fields: form.fields.filter((f) => f.id !== sel.id) });
                    setSelected(null);
                  }}
                  className="mt-3 flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold text-primary ring-1 ring-primary/40"
                >
                  <Trash2 aria-hidden className="size-4" />
                  {t("studio.deleteField")}
                </button>
              </section>
            )}

            <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <h2 className="font-extrabold">{t("studio.formProps")}</h2>
              <div className="mt-2 grid gap-2 text-sm">
                <label>
                  {t("studio.formId")}
                  <input className={cn(input, "font-mono")} value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
                </label>
                <label>
                  {t("studio.code")}
                  <input className={input} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </label>
                {(["en", "si", "ta"] as const).map((l) => (
                  <label key={l}>
                    {t(l === "en" ? "studio.nameEn" : l === "si" ? "studio.nameSi" : "studio.nameTa")}
                    <input className={input} lang={l} value={form.name[l]} onChange={(e) => setForm({ ...form, name: { ...form.name, [l]: e.target.value } })} />
                  </label>
                ))}
                <label>
                  {t("studio.procedure")}
                  <select
                    className={input}
                    value={form.procedureIds[0] ?? ""}
                    onChange={(e) => setForm({ ...form, procedureIds: (e.target.value ? [e.target.value] : []) as FormMap["procedureIds"] })}
                  >
                    <option value="">—</option>
                    {procedures.map((p) => <option key={p.id} value={p.id}>{p.name.en}</option>)}
                  </select>
                </label>
                <label>
                  {t("studio.officer")}
                  <input
                    className={input}
                    value={form.verification.verifiedBy ?? ""}
                    onChange={(e) => setForm({ ...form, verification: { ...form.verification, verifiedBy: e.target.value } })}
                  />
                </label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void check()} className="min-h-12 rounded-xl bg-surface-2 font-semibold ring-1 ring-line">
                  {t("studio.validate")}
                </button>
                <button
                  type="button"
                  disabled={!form.verification.verifiedBy || busy !== null}
                  onClick={() => void publish()}
                  className="min-h-12 rounded-xl bg-green font-semibold text-white disabled:opacity-50"
                >
                  {t("studio.publish")}
                </button>
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
