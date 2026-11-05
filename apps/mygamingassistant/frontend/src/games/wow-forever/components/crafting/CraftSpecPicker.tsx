import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import type { CraftingSpecs } from "@/games/wow-forever/types/craftingSpecs";

const NOT_CHOSEN = "none";

interface CraftSpecPickerProps {
  specs: CraftingSpecs;
  professionLabel: string;
  /** Null = not chosen yet. */
  value: string | null;
  onChange: (spec: string | null) => void;
}

/** "Your specialization": filters the route's specialization recipes. Not chosen yet shows them all. */
export default function CraftSpecPicker({ specs, professionLabel, value, onChange }: CraftSpecPickerProps) {
  const options = [{ id: NOT_CHOSEN, label: "Not chosen yet" }, ...specs.choices.map((c) => ({ id: c.id, label: c.label }))];
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium" aria-hidden="true">
        Your specialization
      </p>
      <SegmentedToggle
        label={`Your ${professionLabel} specialization`}
        options={options}
        value={value ?? NOT_CHOSEN}
        onChange={(id) => onChange(id === NOT_CHOSEN ? null : id)}
        className="flex-wrap"
        compact
      />
    </div>
  );
}
