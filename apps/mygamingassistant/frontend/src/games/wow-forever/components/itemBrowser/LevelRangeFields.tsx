import NumberField from "@/games/wow-forever/components/shared/NumberField";
import { clampInt } from "@/games/wow-forever/lib/itemBrowser/itemBrowserParams";

interface LevelRangeFieldsProps {
  legend: string;
  min: number | null;
  max: number | null;
  lowest: number;
  highest: number;
  onChange: (min: number | null, max: number | null) => void;
  testId: string;
}

/** "From" and "to" boxes for one level; a box left empty is no limit, and a number past the ends is pulled in to them. */
export default function LevelRangeFields({ legend, min, max, lowest, highest, onChange, testId }: LevelRangeFieldsProps) {
  return (
    <fieldset className="min-w-0 space-y-1" data-testid={testId}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span aria-hidden className="text-xs font-medium text-muted-foreground">
            From
          </span>
          <NumberField
            label={`${legend} from`}
            hideLabel
            value={min}
            onChange={(v) => onChange(clampInt(v, lowest, highest), max)}
            min={lowest}
            max={highest}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span aria-hidden className="text-xs font-medium text-muted-foreground">
            To
          </span>
          <NumberField
            label={`${legend} to`}
            hideLabel
            value={max}
            onChange={(v) => onChange(min, clampInt(v, lowest, highest))}
            min={lowest}
            max={highest}
          />
        </div>
      </div>
    </fieldset>
  );
}
