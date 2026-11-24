import type { Metadata } from "next";
import { api, tryServer } from "@/lib/api";
import { ProceduresView } from "./procedures-view";

export const metadata: Metadata = { title: "Procedures" };
export const dynamic = "force-dynamic";

export default async function ProceduresPage() {
  const data = await tryServer(() => api.procedures());
  return <ProceduresView items={data?.items ?? null} />;
}
