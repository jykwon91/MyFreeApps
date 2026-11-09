import type { PropertyPnLRange } from "@mybookkeeper/api-client/types/attribution/property-pnl-range";
import type { PeriodSheetMessages } from "./PeriodSheetMessages";

/** `K` is the screen's own way of naming a choice. A null key is hand-picked dates; a null range is all time. */
export interface PeriodSheetProps<K extends string> {
  choices: readonly { key: K; label: string; range: PropertyPnLRange | null }[];
  selection: { key: K | null; range: PropertyPnLRange | null };
  today: Date;
  messages: PeriodSheetMessages;
  onApply: (selection: { key: K | null; range: PropertyPnLRange | null }) => void;
  onClose: () => void;
}
