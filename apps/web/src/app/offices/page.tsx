import type { Metadata } from "next";
import { api, tryServer } from "@/lib/api";
import { OfficesView } from "./offices-view";

export const metadata: Metadata = { title: "Offices" };
export const dynamic = "force-dynamic";

// Kuruwita town centre: default "near me" point for the demo area until geolocation (M3).
const KURUWITA = { lat: 6.776, lng: 80.366 };

export default async function OfficesPage() {
  const data = await tryServer(() => api.offices(KURUWITA));
  return <OfficesView items={data?.items ?? null} />;
}
