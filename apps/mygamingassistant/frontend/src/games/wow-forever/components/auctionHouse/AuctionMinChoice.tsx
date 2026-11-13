import AuctionFilterChips from "@/games/wow-forever/components/auctionHouse/AuctionFilterChips";
import { MIN_CHOICE_ANY } from "@/games/wow-forever/data/auctionHouse/auctionFilterOptions";
import type { AuctionChipOption } from "@/games/wow-forever/types/auctionHouse/auctionChipOption";

interface AuctionMinChoiceProps {
  legend: string;
  /** "Any" plus the minimums on offer; each id is the number as text. */
  chips: readonly AuctionChipOption<string>[];
  value: number | null;
  onChange: (value: number | null) => void;
  testId: string;
}

/** "Any / 10+ / 100+": one minimum, picked again to clear. */
export default function AuctionMinChoice({ legend, chips, value, onChange, testId }: AuctionMinChoiceProps) {
  return (
    <AuctionFilterChips
      legend={legend}
      options={chips}
      value={[value === null ? MIN_CHOICE_ANY : String(value)]}
      onToggle={(id) => onChange(id === MIN_CHOICE_ANY || id === String(value) ? null : Number(id))}
      testId={testId}
    />
  );
}
