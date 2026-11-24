import { notFound } from "next/navigation";
import { ProcedureDetailView } from "@/components/procedure-detail";
import { api, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ProcedurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await api.procedure(id).catch((err: unknown) => {
    if (err instanceof ApiError && err.kind === "not_found") notFound();
    throw err;
  });
  return <ProcedureDetailView detail={detail} />;
}
