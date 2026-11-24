import { ClipboardList, FileText, MapPin, MessageCirclePlus, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/i18n/dictionaries";

export interface NavItem {
  href: string;
  label: MessageKey;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "nav.ask", icon: MessageCirclePlus, match: (p) => p === "/" || p.startsWith("/ask") },
  { href: "/procedures", label: "nav.procedures", icon: FileText, match: (p) => p.startsWith("/procedures") },
  { href: "/offices", label: "nav.offices", icon: MapPin, match: (p) => p.startsWith("/offices") },
  { href: "/requests", label: "nav.requests", icon: ClipboardList, match: (p) => p.startsWith("/requests") },
];
