import type { ChipTone } from "./ChipTone";

export interface ChipProps {
  label: string;
  /** Colours the chip. The label still says it in words. Leave out for a plain chip. */
  tone?: ChipTone;
}
