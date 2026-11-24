"use client";

import { Check, CircleAlert, Clock, MapPin, Navigation, Phone, Printer, Share2, Square, WifiOff } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import type { Lang } from "@/i18n/dictionaries";
import { api } from "@/lib/api";
import { formatDays, groupHours } from "@/lib/hours";
import { formatSlDate } from "@/lib/sl";
import { getOpenRequestFor, getPack, getProfile, savePack, touchRequest, type VisitPackSnapshot } from "@/lib/store";
import { encodePayload } from "@/lib/visit-pack";

async function buildPack(procedureId: string, lang: Lang): Promise<VisitPackSnapshot> {
  const [detail, offices, profile, existing] = await Promise.all([
    api.procedure(procedureId),
    api.offices({ procedureId }),
    getProfile(),
    getOpenRequestFor(procedureId),
  ]);
  const request = existing ?? (await touchRequest(procedureId, lang));
  const p = detail.procedure;
  // Prefer the citizen's own GN office, then an office of the procedure's type, then any.
  const office =
    offices.items.find((o) => profile?.gnDivisionCode && o.adminArea.gnCode === profile.gnDivisionCode && o.type === "GN" && p.officeType === "GN") ??
    offices.items.find((o) => o.type === p.officeType) ??
    offices.items[0] ??
    null;
  const checklist = request?.checklist ?? {};
  const formId = request?.formId ?? p.formIds?.[0] ?? null;
  const qr = encodePayload({
    v: 1,
    p: p.id,
    o: office?.id ?? null,
    c: p.requiredDocuments.filter((d) => checklist[d.id]).map((d) => d.id),
    d: p.requiredDocuments.length,
    f: formId,
    fp: request?.formFilledPct ?? null,
    n: profile?.nameWithInitials ?? null,
    l: lang,
    t: new Date().toISOString().slice(0, 10),
  });
  return {
    procedureId: p.id,
    requestId: request?.id ?? "",
    createdAt: new Date().toISOString(),
    procedure: {
      name: p.name,
      fee: p.fee.short ?? p.fee.text,
      time: p.processingTime.short ?? p.processingTime.text,
      officeFlow: p.officeFlow,
    },
    office,
    documents: p.requiredDocuments.map((d) => ({
      id: d.id,
      name: d.name,
      conditional: d.conditional ?? null,
      done: Boolean(checklist[d.id]),
    })),
    form: formId
      ? {
          id: formId,
          code: formId,
          name: p.name,
          filledPct: request?.formFilledPct ?? null,
          byHand: request?.manualSteps ?? [],
        }
      : null,
    qr,
  };
}

export function VisitPackView({ procedureId }: { procedureId: string }) {
  const { t, lang } = useI18n();
  const [pack, setPack] = useState<VisitPackSnapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const [missing, setMissing] = useState(false);
  const [qrSrc, setQrSrc] = useState<string>("");

  useEffect(() => {
    let alive = true;
    let fresh = false;
    // Stale-while-revalidate: show the snapshot saved on this phone at once (fast on 3G,
    // works offline), then replace it with live data if the network answers.
    void getPack(procedureId).then((saved) => {
      if (alive && saved && !fresh) setPack(saved);
    });
    buildPack(procedureId, lang)
      .then(async (built) => {
        fresh = true;
        await savePack(built);
        if (alive) {
          setPack(built);
          setOffline(false);
        }
      })
      .catch(async () => {
        const saved = await getPack(procedureId);
        if (!alive) return;
        if (saved) {
          setPack(saved);
          setOffline(true);
        } else setMissing(true);
      });
    return () => {
      alive = false;
    };
  }, [procedureId, lang]);

  useEffect(() => {
    if (!pack) return;
    let alive = true;
    void QRCode.toDataURL(pack.qr, { margin: 1, width: 360, errorCorrectionLevel: "M", color: { dark: "#2A1A1A" } }).then(
      (url) => alive && setQrSrc(url),
    );
    return () => {
      alive = false;
    };
  }, [pack]);

  if (missing) return <p className="p-6 text-muted">{t("visitPack.notFound")}</p>;
  if (!pack) return <p className="p-6 text-muted" role="status">{t("common.loading")}</p>;

  const o = pack.office;
  const dayName = (d: number) => t(`hours.d${d}` as never);
  const share = async () => {
    const text = t("visitPack.shareText", {
      procedure: pack.procedure.name[lang],
      office: o?.name[lang] ?? "",
      count: pack.documents.length,
    });
    if (navigator.share) {
      await navigator.share({ title: t("visitPack.title"), text, url: window.location.href }).catch(() => undefined);
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${window.location.href}`)}`, "_blank", "noopener");
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white"
        >
          <Printer aria-hidden className="size-5" />
          {t("visitPack.save")}
        </button>
        <button
          type="button"
          onClick={() => void share()}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-green px-4 font-semibold text-white"
        >
          <Share2 aria-hidden className="size-5" />
          {t("visitPack.share")}
        </button>
      </div>
      {offline && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm print:hidden">
          <WifiOff aria-hidden className="size-4" />
          {t("visitPack.offline")}
        </p>
      )}

      <article className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line print:rounded-none print:ring-0">
        <header className="relative bg-primary-deep px-5 pt-4 pb-6 text-white print:bg-white print:text-ink">
          <div className="liyapata absolute inset-x-0 bottom-0 h-6 opacity-70" aria-hidden />
          <div className="flex items-center justify-between gap-3">
            <Image src="/brand/mark.png" alt="" width={36} height={36} />
            <span className="text-xs text-white/80 print:text-muted">
              {t("visitPack.issued", { date: formatSlDate(pack.createdAt) })}
            </span>
          </div>
          <p className="mt-2 text-xs font-bold tracking-wide text-gold uppercase">{t("visitPack.title")}</p>
          <h1 className="text-2xl font-extrabold">{pack.procedure.name[lang]}</h1>
          <p className="text-sm text-white/85 print:text-muted">{t("visitPack.subtitle")}</p>
        </header>
        <div className="tricolour" aria-hidden />

        <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <section>
              <h2 className="text-xs font-bold tracking-wide text-muted uppercase">{t("visitPack.goTo")}</h2>
              {o ? (
                <>
                  <p className="text-lg font-extrabold">{o.name[lang]}</p>
                  <p className="flex items-start gap-1.5 text-sm text-muted">
                    <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {o.address[lang]}
                  </p>
                  {o.hours && o.hours.length > 0 && (
                    <div className="mt-2 text-sm">
                      <p className="flex items-center gap-1.5 font-semibold">
                        <Clock aria-hidden className="size-4" />
                        {t("visitPack.hours")}
                      </p>
                      <ul className="ml-6">
                        {groupHours(o.hours ?? []).map((r) => (
                          <li key={`${r.days.join()}-${r.open}`}>
                            {formatDays(r.days, dayName)} · {r.open}–{r.close}
                          </li>
                        ))}
                      </ul>
                      {o.hoursNote && <p className="ml-6 text-xs text-muted">{o.hoursNote[lang]}</p>}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${o.location.lat},${o.location.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-11 items-center gap-1.5 rounded-xl bg-primary-deep px-3 text-sm font-semibold text-white"
                    >
                      <Navigation aria-hidden className="size-4" />
                      {t("visitPack.directions")}
                    </a>
                    {o.phone && (
                      <a
                        href={`tel:${o.phone.replace(/\s/g, "")}`}
                        className="flex min-h-11 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-sm font-semibold ring-1 ring-line"
                      >
                        <Phone aria-hidden className="size-4" />
                        {o.phone}
                      </a>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm">{t("visitPack.noOffice")}</p>
              )}
            </section>

            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-surface-2 p-3">
                <dt className="text-xs font-bold text-muted uppercase">{t("chat.fee")}</dt>
                <dd className="font-bold">{pack.procedure.fee[lang]}</dd>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <dt className="text-xs font-bold text-muted uppercase">{t("chat.time")}</dt>
                <dd className="font-bold">{pack.procedure.time[lang]}</dd>
              </div>
            </dl>
          </div>

          <figure className="mx-auto w-44 text-center sm:mx-0">
            <div className="aspect-square rounded-xl bg-white p-2 ring-1 ring-line">
              {qrSrc && (
                // eslint-disable-next-line @next/next/no-img-element -- local data URL, not optimisable
                <img src={qrSrc} alt={t("visitPack.scanMe")} className="size-full" />
              )}
            </div>
            <figcaption className="mt-1 text-xs text-muted">{t("visitPack.scanMe")}</figcaption>
          </figure>
        </div>

        <section className="border-t border-line p-5">
          <h2 className="mb-2 font-extrabold">{t("visitPack.bring")}</h2>
          <ul className="space-y-1.5">
            {pack.documents.map((d) => (
              <li key={d.id} className="flex items-start gap-2">
                {d.done ? (
                  <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-green" />
                ) : (
                  <Square aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
                )}
                <span>
                  {d.name[lang]}
                  {d.conditional && <span className="block text-xs text-muted">{d.conditional[lang]}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-line p-5">
          <h2 className="mb-1 font-extrabold">{t("visitPack.form")}</h2>
          <p className="text-sm">
            {pack.form?.filledPct != null
              ? t("visitPack.formReady", { pct: pack.form.filledPct })
              : t("visitPack.formNotYet")}
          </p>
          {pack.form && pack.form.byHand.length > 0 && (
            <div className="mt-2 rounded-xl bg-saffron/12 p-3">
              <p className="flex items-center gap-1.5 text-sm font-bold text-saffron-ink">
                <CircleAlert aria-hidden className="size-4" />
                {t("visitPack.byHand")}
              </p>
              <ul className="mt-1 list-disc pl-6 text-sm">
                {pack.form.byHand.map((s) => (
                  <li key={s.en}>{s[lang]}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <p className="border-t border-line px-5 py-3 text-xs text-muted">{t("app.limits")}</p>
      </article>
    </div>
  );
}
