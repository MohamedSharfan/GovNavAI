"use client";

import { FileCheck2, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ProcedureIcon } from "@/components/procedure-icon";
import { useI18n } from "@/components/providers/i18n-provider";
import type { ProcedureSummary } from "@/lib/api";

export function ProceduresView({ items }: { items: ProcedureSummary[] | null }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = (items ?? []).filter(
      (p) => !needle || [p.name.en, p.name.si, p.name.ta, p.summary[lang]].some((s) => s.toLowerCase().includes(needle)),
    );
    const byCat = new Map<string, ProcedureSummary[]>();
    for (const p of filtered) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
    return [...byCat.entries()];
  }, [items, q, lang]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-extrabold">{t("procedures.title")}</h1>
      <p className="text-muted">{t("procedures.subtitle")}</p>
      <label className="mt-4 flex items-center gap-2 rounded-xl bg-surface px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-gold">
        <Search aria-hidden className="size-5 text-muted" />
        <span className="sr-only">{t("procedures.search")}</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("procedures.search")}
          className="min-h-12 flex-1 bg-transparent focus:outline-none"
        />
      </label>

      {items === null && <p className="mt-6 text-muted">{t("chat.networkError")}</p>}
      {items !== null && groups.length === 0 && <p className="mt-6 text-muted">{t("procedures.notFound")}</p>}

      {groups.map(([cat, procs]) => (
        <section key={cat} className="mt-6" aria-labelledby={`cat-${cat}`}>
          <h2 id={`cat-${cat}`} className="mb-2 text-sm font-bold tracking-wide text-muted uppercase">
            {t(`procedures.category.${cat}` as never)}
          </h2>
          <ul className="space-y-2">
            {procs.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/procedures/${p.id}`}
                  className="flex items-start gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line hover:ring-primary/40"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                    <ProcedureIcon id={p.id} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{p.name[lang]}</span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{p.summary[lang]}</span>
                    <span className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
                      <span className="rounded-full bg-surface-2 px-2 py-0.5">{p.office[lang]}</span>
                      <span className={p.isFree ? "rounded-full bg-green/10 px-2 py-0.5 text-green" : "rounded-full bg-surface-2 px-2 py-0.5"}>
                        {p.fee[lang]}
                      </span>
                      <span className="rounded-full bg-surface-2 px-2 py-0.5">
                        {t("procedures.documents", { count: p.documentCount })}
                      </span>
                      {p.hasForm && (
                        <span className="flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-primary-deep">
                          <FileCheck2 aria-hidden className="size-3" />
                          {t("procedures.hasForm")}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
