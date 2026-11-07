import { CircleQuestionMark, Database, Eye, History, Megaphone, type LucideIcon } from "lucide-react";
import type { Provenance } from "@/games/wow-forever/types/provenance/provenance";

/** Badges differ by icon and word, never by colour (WoW's greens/blues/purples already mean item quality). */
export const PROVENANCE_ICON: Readonly<Record<Provenance, LucideIcon>> = {
  seen: Eye,
  published: Megaphone,
  client: Database,
  classic: History,
  unconfirmed: CircleQuestionMark,
};
