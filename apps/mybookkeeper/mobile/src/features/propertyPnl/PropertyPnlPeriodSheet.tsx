import { PROPERTY_PNL_PRESETS } from "@mybookkeeper/api-client/constants/propertyPnl";
import type { PropertyPnLPreset } from "@mybookkeeper/api-client/types/attribution/property-pnl-preset";
import { propertyPnlRange } from "@mybookkeeper/api-client/utils/propertyPnlRange";
import { useMemo } from "react";
import { PROPERTY_PNL_MESSAGES as MESSAGES } from "../../constants/propertyPnl";
import type { PropertyPnlSelection } from "../../types/PropertyPnlSelection";
import PeriodSheet from "../analyticsControls/PeriodSheet";

interface PropertyPnlPeriodSheetProps {
  selection: PropertyPnlSelection;
  today: Date;
  onApply: (selection: PropertyPnlSelection) => void;
  onClose: () => void;
}

/** The property P&L's period sheet: its three presets and hand-picked dates, never all time. */
export default function PropertyPnlPeriodSheet({ selection, today, onApply, onClose }: PropertyPnlPeriodSheetProps) {
  const choices = useMemo(() => PROPERTY_PNL_PRESETS.map((preset) => ({ key: preset.key, label: preset.label, range: propertyPnlRange(preset.key, today) })), [today]);
  return (
    <PeriodSheet<PropertyPnLPreset>
      choices={choices}
      messages={MESSAGES}
      onApply={(chosen) => {
        if (chosen.range) onApply({ range: chosen.range, preset: chosen.key });
      }}
      onClose={onClose}
      selection={{ key: selection.preset, range: selection.range }}
      today={today}
    />
  );
}
