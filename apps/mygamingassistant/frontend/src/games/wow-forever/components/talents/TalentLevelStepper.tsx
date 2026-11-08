import { Minus, Plus } from "lucide-react";
import NumberField from "@/games/wow-forever/components/shared/NumberField";
import { MAX_TALENT_LEVEL } from "@/games/wow-forever/data/talents/talentConfig";

interface TalentLevelStepperProps {
  level: number;
  /** The lowest level the spent points allow. */
  minLevel: number;
  onChange: (level: number) => void;
}

/** Character level 10–60, never below what the spent points need. */
export default function TalentLevelStepper({ level, minLevel, onChange }: TalentLevelStepperProps) {
  return (
    <div className="flex items-end gap-1" data-testid="talent-level">
      <button
        type="button"
        onClick={() => onChange(level - 1)}
        disabled={level <= minLevel}
        aria-label="Level down"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border hover:bg-muted/40 disabled:opacity-40"
      >
        <Minus aria-hidden className="h-4 w-4" />
      </button>
      <NumberField
        label="Level"
        value={level}
        min={minLevel}
        max={MAX_TALENT_LEVEL}
        onChange={(value) => {
          if (value !== null && Number.isInteger(value) && value >= minLevel && value <= MAX_TALENT_LEVEL) onChange(value);
        }}
        className="flex w-20 flex-col gap-1"
      />
      <button
        type="button"
        onClick={() => onChange(level + 1)}
        disabled={level >= MAX_TALENT_LEVEL}
        aria-label="Level up"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border hover:bg-muted/40 disabled:opacity-40"
      >
        <Plus aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
