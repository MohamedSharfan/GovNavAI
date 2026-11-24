import { api, tryServer } from "@/lib/api";
import { HomeView } from "./home-view";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await tryServer(() => api.procedures());
  return <HomeView procedures={data?.items ?? null} />;
}
