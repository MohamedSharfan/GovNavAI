import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { FormView } from "./form-view";

export const metadata: Metadata = { title: "Official form" };
export const dynamic = "force-dynamic";

/** /forms/<procedureId>: find the procedure's official form and pre-fill it. */
export default async function FormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await api.procedure(id).catch((err: unknown) => {
    if (err instanceof ApiError && err.kind === "not_found") notFound();
    throw err;
  });
  return <FormView procedureId={id} formIds={detail.procedure.formIds ?? []} />;
}
