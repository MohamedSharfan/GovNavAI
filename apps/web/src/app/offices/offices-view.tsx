"use client";

import { MapPin, Phone } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import type { OfficeRow } from "@/lib/api";

/** M1: curated office list. M3 adds Maps, open/closed status, directions and queue status. */
export function OfficesView({ items }: { items: OfficeRow[] | null }) {
  const { t, lang } = useI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-extrabold">{t("offices.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("offices.comingSoon")}</p>
      {items === null && <p className="mt-6 text-muted">{t("chat.networkError")}</p>}
      <ul className="mt-4 space-y-2">
        {(items ?? []).map((o) => (
          <li key={o.id} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <p className="font-bold">{o.name[lang]}</p>
            <p className="mt-0.5 flex items-start gap-1 text-sm text-muted">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
              {o.address[lang]}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              {o.distanceKm !== null && <span className="font-semibold">{o.distanceKm} km</span>}
              {o.phone && (
                <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="flex min-h-11 items-center gap-1 font-semibold text-primary">
                  <Phone aria-hidden className="size-4" />
                  {o.phone}
                </a>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
