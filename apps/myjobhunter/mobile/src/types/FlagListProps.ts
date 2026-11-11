import type { ChipTone } from "@platform/mobile";

export interface FlagListProps {
  title: string;
  tone: ChipTone;
  flags: readonly string[];
}
