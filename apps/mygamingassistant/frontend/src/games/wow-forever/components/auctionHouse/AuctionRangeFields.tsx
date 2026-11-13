import NumberField from "@/games/wow-forever/components/shared/NumberField";
import { clampToRange } from "@/games/wow-forever/lib/auctionHouse/clampToRange";

interface AuctionRangeFieldsProps {
  legend: string;
  minLabel: string;
  maxLabel: string;
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
  /** Smallest and largest values the fields accept; anything typed outside is pulled in. */
  lowest: number;
  limit: number;
  /** Decimal places kept; anything finer is rounded off. */
  decimals: number;
  /** The spinner's step (1 when left out). */
  step?: number;
  testId: string;
}

/** Two number boxes, from and to; either may be left empty. */
export default function AuctionRangeFields({ legend, minLabel, maxLabel, min, max, onChange, lowest, limit, decimals, step, testId }: AuctionRangeFieldsProps) {
  const clamp = (value: number | null) => clampToRange(value, lowest, limit, decimals);
  return (
    <fieldset className="min-w-0 space-y-1" data-testid={testId}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={minLabel} value={min} onChange={(next) => onChange(clamp(next), max)} min={lowest} max={limit} step={step} />
        <NumberField label={maxLabel} value={max} onChange={(next) => onChange(min, clamp(next))} min={lowest} max={limit} step={step} />
      </div>
    </fieldset>
  );
}
