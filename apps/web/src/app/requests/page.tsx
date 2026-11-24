"use client";

import type { CitizenRequest } from "@govnav/shared";
import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { listRequests } from "@/lib/store";

export default function RequestsPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<CitizenRequest[] | null>(null);

  useEffect(() => {
    let alive = true;
    void listRequests().then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-extrabold">{t("requests.title")}</h1>
      <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t("requests.empty")}
      </p>
      <ul className="mt-4 space-y-2">
        {(rows ?? []).map((r) => {
          const done = Object.values(r.checklist ?? {}).filter(Boolean).length;
          return (
            <li key={r.id}>
              <Link
                href={`/procedures/${r.procedureId}`}
                className="flex items-center justify-between rounded-2xl bg-surface p-4 ring-1 ring-line hover:ring-primary/40"
              >
                <span>
                  <span className="block font-bold">{r.procedureId.replaceAll("-", " ")}</span>
                  <span className="text-sm text-muted">
                    {new Date(r.updatedAt).toLocaleDateString()} · ✓ {done}
                  </span>
                </span>
                <ArrowRight aria-hidden className="size-5 text-primary" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
