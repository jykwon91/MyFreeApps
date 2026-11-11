import type { WowIcon } from "@/games/wow-forever/types/icons/wowIcon";

/** One choice in a SegmentedToggle; `icon` draws the in-game icon before the label (null = its placeholder). */
export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  icon?: WowIcon | null;
}
