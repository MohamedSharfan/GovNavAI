"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { ProcedureDetailView } from "@/components/procedure-detail";
import { useI18n } from "@/components/providers/i18n-provider";
import { api, type ProcedureDetail } from "@/lib/api";

/** Client-side loader for the desktop side panel. Parent passes `key={procedureId}` to reset state. */
export function ProcedurePanel({ procedureId }: { procedureId: string }) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<ProcedureDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .procedure(procedureId)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [procedureId]);

  if (failed) return <p className="p-6 text-muted">{t("chat.error")}</p>;
  if (!detail)
    return (
      <p className="flex items-center gap-2 p-6 text-muted" role="status">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        {t("common.loading")}
      </p>
    );
  return <ProcedureDetailView detail={detail} compact />;
}
