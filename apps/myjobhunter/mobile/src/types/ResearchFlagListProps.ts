import type { ChipTone } from "@platform/mobile";

export interface ResearchFlagListProps {
  title: string;
  tone: ChipTone;
  flags: readonly string[];
}
