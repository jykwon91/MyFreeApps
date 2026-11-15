import type { LucideIcon } from "lucide-react";
import type { BuffsAddonCheckId } from "@/games/wow-forever/types/buffsAddon/buffsAddonCheckId";

/** One thing the MGA Buffs addon watches, as the download card lists it. */
export interface BuffsAddonCheck {
  readonly id: BuffsAddonCheckId;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly text: string;
}
