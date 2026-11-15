import type { LucideIcon } from "lucide-react";

/** One thing the MGA Buffs addon watches, as the download card lists it. */
export interface BuffsAddonCheck {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly text: string;
}
