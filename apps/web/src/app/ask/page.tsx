import type { Metadata } from "next";
import { api, tryServer } from "@/lib/api";
import { ChatView } from "./chat-view";

export const metadata: Metadata = { title: "Ask" };
export const dynamic = "force-dynamic";

export default async function AskPage() {
  const data = await tryServer(() => api.procedures());
  return <ChatView procedureCount={data?.count ?? null} />;
}
