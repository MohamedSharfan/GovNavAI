import type { Metadata } from "next";
import { VisitPackView } from "./visit-pack-view";

export const metadata: Metadata = { title: "Visit pack" };

export default async function VisitPackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VisitPackView procedureId={id} />;
}
