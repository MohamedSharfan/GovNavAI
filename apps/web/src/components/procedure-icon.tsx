import {
  Baby,
  FileBadge,
  FileText,
  HeartHandshake,
  House,
  IdCard,
  Landmark,
  ScrollText,
  UserCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "income-certificate": FileBadge,
  "character-certificate": UserCheck,
  "residence-certificate": House,
  "birth-certificate-copy": Baby,
  "marriage-certificate-copy": HeartHandshake,
  "death-certificate-copy": ScrollText,
  "nic-application": IdCard,
  "senior-citizen-id": UserRound,
  "land-deed-extract": Landmark,
};

export function ProcedureIcon({ id, className }: { id: string; className?: string }) {
  const Icon = ICONS[id] ?? FileText;
  return <Icon aria-hidden className={className} />;
}
