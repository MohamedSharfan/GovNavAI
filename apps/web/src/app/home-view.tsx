"use client";

import type { CitizenRequest } from "@govnav/shared";
import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AskBar } from "@/components/chat/ask-bar";
import { ProcedureIcon } from "@/components/procedure-icon";
import { useI18n } from "@/components/providers/i18n-provider";
import type { Lang } from "@/i18n/dictionaries";
import type { ProcedureSummary } from "@/lib/api";
import { listRequests, setPendingQuestion } from "@/lib/store";

const FEATURED = ["income-certificate", "character-certificate", "residence-certificate", "land-deed-extract"];
const SECOND_LANG: Record<Lang, Lang> = { en: "si", si: "en", ta: "en" };

export function HomeView({ procedures }: { procedures: ProcedureSummary[] | null }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [latest, setLatest] = useState<CitizenRequest | null>(null);

  useEffect(() => {
    let alive = true;
    void listRequests().then((rows) => {
      if (alive) setLatest(rows.find((r) => r.status !== "visited") ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const ask = useCallback(
    (q: string) => {
      setPendingQuestion(q);
      router.push("/ask");
    },
    [router],
  );

  const featured = procedures
    ? [
        ...FEATURED.map((id) => procedures.find((p) => p.id === id)).filter((p): p is ProcedureSummary => !!p),
        ...procedures.filter((p) => !FEATURED.includes(p.id)),
      ].slice(0, 4)
    : [];
  const latestProc = latest && procedures?.find((p) => p.id === latest.procedureId);
  const done = latest ? Object.values(latest.checklist ?? {}).filter(Boolean).length : 0;
  const total = latestProc?.documentCount ?? 0;

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        {/* Dark hero */}
        <section className="relative overflow-hidden rounded-b-[28px] bg-primary-deep px-4 pt-6 pb-10 text-white lg:rounded-none lg:px-10 lg:pt-14 lg:pb-16">
          <div className="liyapata pointer-events-none absolute inset-x-0 bottom-0 h-16 opacity-60" aria-hidden />
          <div className="relative mx-auto max-w-2xl">
            <p className="text-gold" lang={lang}>
              {t("home.greeting")}
            </p>
            <h1 className="display mt-1 text-[1.75rem] leading-tight font-extrabold sm:text-4xl">{t("home.title")}</h1>
            <div className="mt-6">
              <AskBar onSubmit={ask} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2" aria-label={t("home.examples")}>
              {(["home.example1", "home.example2", "home.example3"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => ask(t(k))}
                  className="min-h-11 rounded-full bg-white/10 px-3 py-1.5 text-left text-sm text-white/90 ring-1 ring-white/20 hover:bg-white/15"
                >
                  {t(k)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-2xl px-4 py-6 lg:px-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-bold tracking-wide text-muted uppercase">{t("home.common")}</h2>
            {procedures && (
              <Link href="/procedures" className="min-h-11 py-2 text-sm font-semibold text-primary">
                {t("home.all", { count: procedures.length })}
              </Link>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {featured.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/procedures/${p.id}`}
                  className="flex h-full min-h-32 flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line transition hover:ring-primary/40"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/8 text-primary">
                    <ProcedureIcon id={p.id} className="size-5" />
                  </span>
                  <span>
                    <span className="block leading-snug font-bold">{p.name[lang]}</span>
                    <span className="mt-0.5 block text-xs text-muted" lang={SECOND_LANG[lang]}>
                      {p.name[SECOND_LANG[lang]]}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {latest && latestProc && (
            <section className="mt-6" aria-labelledby="continue-h">
              <h2 id="continue-h" className="mb-3 text-sm font-bold tracking-wide text-muted uppercase">
                {t("home.continue")}
              </h2>
              <Link
                href={`/procedures/${latest.procedureId}`}
                className="block rounded-2xl bg-primary-deep p-4 text-white"
              >
                <span className="flex items-center justify-between">
                  <span className="font-bold">{latestProc.name[lang]}</span>
                  <span className="text-sm font-semibold text-gold">
                    {t("home.continueProgress", { done, total })}
                  </span>
                </span>
                <span className="mt-3 block h-2 overflow-hidden rounded-full bg-white/15">
                  <span
                    className="block h-full rounded-full bg-gold"
                    style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }}
                  />
                </span>
                <span className="mt-2 flex items-center gap-1 text-sm text-white/75">
                  {latestProc.office[lang]} · {t("home.resume")} <ArrowRight aria-hidden className="size-4" />
                </span>
              </Link>
            </section>
          )}
        </div>
      </div>

      {/* Desktop side panel */}
      <aside className="hidden border-l border-line bg-surface p-8 lg:block">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles aria-hidden className="size-5" />
          <h2 className="font-bold">{t("chat.title")}</h2>
        </div>
        <p className="mt-3 text-muted">{t("chat.empty")}</p>
        <p className="mt-6 rounded-xl bg-surface-2 p-4 text-sm text-muted">{t("app.limits")}</p>
      </aside>
    </div>
  );
}
