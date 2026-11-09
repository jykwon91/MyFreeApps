import { useState } from "react";
import { Calendar } from "lucide-react";
import { Button } from "@platform/ui";
import { PROPERTY_PNL_PRESETS } from "@mybookkeeper/api-client/constants/propertyPnl";
import type { PropertyPnLPreset } from "@mybookkeeper/api-client/types/attribution/property-pnl-preset";
import type { PropertyPnLRange } from "@mybookkeeper/api-client/types/attribution/property-pnl-range";
import { isValidPropertyPnlRange, propertyPnlRange } from "@mybookkeeper/api-client/utils/propertyPnlRange";

export interface PnLDateRangeSelectorProps {
  value: PropertyPnLRange;
  onChange: (range: PropertyPnLRange) => void;
}

export default function PnLDateRangeSelector({ value, onChange }: PnLDateRangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customSince, setCustomSince] = useState(value.since);
  const [customUntil, setCustomUntil] = useState(value.until);

  const handlePreset = (preset: PropertyPnLPreset) => {
    setShowCustom(false);
    onChange(propertyPnlRange(preset, new Date()));
  };

  const handleCustomApply = () => {
    if (isValidPropertyPnlRange({ since: customSince, until: customUntil })) {
      onChange({ since: customSince, until: customUntil });
      setShowCustom(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PROPERTY_PNL_PRESETS.map(({ key, label }) => (
        <Button
          key={key}
          variant={!showCustom && value.since === propertyPnlRange(key, new Date()).since ? "primary" : "secondary"}
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
            max={propertyPnlRange("this_month", new Date()).until}
            onChange={(e) => setCustomUntil(e.target.value)}
            className="border rounded px-2 py-1 text-sm bg-background min-h-[44px]"
            aria-label="End date"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleCustomApply}
            disabled={!isValidPropertyPnlRange({ since: customSince, until: customUntil })}
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
