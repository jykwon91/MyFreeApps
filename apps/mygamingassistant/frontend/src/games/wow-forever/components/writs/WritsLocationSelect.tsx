import { Select } from "@platform/ui";
import type { WritLocationOption } from "@/games/wow-forever/types/writs/writLocationOption";

interface WritsLocationSelectProps {
  value: string | null;
  options: readonly WritLocationOption[];
  onChange: (location: string | null) => void;
}

/** Turn-in location: all, each recorded zone, or "Not known yet", each with how many writs it would show. */
export default function WritsLocationSelect({ value, options, onChange }: WritsLocationSelectProps) {
  const total = options.reduce((sum, o) => sum + o.count, 0);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="writ-location" className="text-sm font-medium">
        Turn-in location
      </label>
      <Select
        id="writ-location"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="min-h-[44px] bg-card text-base sm:text-sm"
      >
        <option value="">{`All locations (${total})`}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {`${o.label} (${o.count})`}
          </option>
        ))}
      </Select>
    </div>
  );
}
