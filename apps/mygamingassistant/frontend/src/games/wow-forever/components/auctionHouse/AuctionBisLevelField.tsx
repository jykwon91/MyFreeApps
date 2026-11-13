import { useState } from "react";
import { GEAR_FOR_COPY } from "@/games/wow-forever/data/auctionHouse/auctionGearForCopy";
import { bisLevelPatch, parseBisLevelText } from "@/games/wow-forever/lib/auctionHouse/bisLevelPatch";
import type { AuctionFilters } from "@/games/wow-forever/types/auctionHouse/auctionFilters";

interface AuctionBisLevelFieldProps {
  filters: AuctionFilters;
  onFilters: (patch: Partial<AuctionFilters>) => void;
  /** The level used when the box is empty: the player's saved one. */
  defaultLevel: number;
}

const HINT_ID = "auction-bis-level-hint";

/**
 * The level the top picks are for, e.g. 39. Empty = the player's saved level.
 * Applied on Enter or leaving the box, so typing "60" never shows level 6's picks first.
 */
export default function AuctionBisLevelField({ filters, onFilters, defaultLevel }: AuctionBisLevelFieldProps) {
  const linked = filters.bisLevel === null ? "" : String(filters.bisLevel);
  // What the link says, and whether the picks are on: when either changes from
  // elsewhere (Clear all, Back, Off), the box shows the link again.
  const linkKey = `${linked}|${filters.bis ?? ""}`;
  const [text, setText] = useState(linked);
  const [seen, setSeen] = useState(linkKey);
  if (linkKey !== seen) {
    setSeen(linkKey);
    setText(linked);
  }
  const invalid = text.trim() !== "" && parseBisLevelText(text) === null;

  const commit = () => {
    if (text === linked) return;
    const patch = bisLevelPatch(text, filters.bis);
    if (patch) onFilters(patch);
  };

  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {GEAR_FOR_COPY.level}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={String(defaultLevel)}
        value={text}
        aria-invalid={invalid}
        aria-describedby={invalid ? HINT_ID : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className="min-h-[44px] w-24 rounded-md border bg-background px-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-primary aria-[invalid=true]:border-destructive"
      />
      {invalid && (
        <span id={HINT_ID} className="text-xs font-normal text-destructive">
          {GEAR_FOR_COPY.levelHint}
        </span>
      )}
    </label>
  );
}
