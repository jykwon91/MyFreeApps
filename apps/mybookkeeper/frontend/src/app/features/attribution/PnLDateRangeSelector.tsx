import { useState } from "react";
import { Calendar } from "lucide-react";
import Button from "@/shared/components/ui/Button";

type Preset = "this_month" | "this_quarter" | "ytd" | "custom";

interface DateRange {
  since: string;
  until: string;
}

export interface PnLDateRangeSelectorProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOf(preset: Exclude<Preset, "custom">): DateRange {
  const now = new Date();
  const until = today();

  if (preset === "this_month") {
    const since = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    return { since, until };
  }

  if (preset === "this_quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const since = new Date(now.getFullYear(), quarterStartMonth, 1)
      .toISOString()
      .slice(0, 10);
    return { since, until };
  }

  // ytd
  const since = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  return { since, until };
}

const PRESETS: { key: Exclude<Preset, "custom">; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "ytd", label: "YTD" },
];

export default function PnLDateRangeSelector({ value, onChange }: PnLDateRangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customSince, setCustomSince] = useState(value.since);
  const [customUntil, setCustomUntil] = useState(value.until);

  const handlePreset = (preset: Exclude<Preset, "custom">) => {
    setShowCustom(false);
    onChange(startOf(preset));
  };

  const handleCustomApply = () => {
    if (customSince && customUntil && customSince <= customUntil) {
      onChange({ since: customSince, until: customUntil });
      setShowCustom(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(({ key, label }) => (
        <Button
          key={key}
          variant={!showCustom && value.since === startOf(key).since ? "primary" : "secondary"}
          size="sm"
          onClick={() => handlePreset(key)}
        >
          {label}
        </Button>
      ))}
      <Button
        variant={showCustom ? "primary" : "secondary"}
        size="sm"
        onClick={() => setShowCustom((prev) => !prev)}
      >
        <Calendar className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
        Custom
      </Button>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 w-full mt-1">
          <input
            type="date"
            value={customSince}
            max={customUntil}
            onChange={(e) => setCustomSince(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-background min-h-[44px]"
            aria-label="Start date"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="date"
            value={customUntil}
            min={customSince}
            max={today()}
            onChange={(e) => setCustomUntil(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-background min-h-[44px]"
            aria-label="End date"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleCustomApply}
            disabled={!customSince || !customUntil || customSince > customUntil}
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
