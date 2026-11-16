import { COMPARE_MODES } from "@mybookkeeper/api-client/constants/analyticsRanges";
import { LoadingButton, OptionSheet, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import type { AnalysisControlsProps } from "../../types/AnalysisControlsProps";
import PickerField from "../transactions/PickerField";
import AnalysisPeriodSheet from "./AnalysisPeriodSheet";
import { selectionDates, selectionName } from "./analysisPeriod";
import PropertyPickerField from "./PropertyPickerField";

/** Period, compare and property pickers; each opens its own sheet so the numbers keep the screen. */
export default function AnalysisControls({ choices, selection, onSelection, compare, onCompare, properties, propertyIds, onPropertyIds, maxProperties, yearsFailed, onRetryYears, today, children }: AnalysisControlsProps) {
  const { spacing, colors, fontSize } = useTheme();
  const [openSheet, setOpenSheet] = useState<"period" | "compare" | null>(null);
  const canCompare = selection.range !== null;
  const compareLabel = COMPARE_MODES.find((mode) => mode.key === compare)?.label ?? "";

  return (
    <View style={{ gap: spacing.md }}>
      {yearsFailed && onRetryYears ? (
        <>
          <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: colors.foreground }}>{MESSAGES.yearsFailed}</Text>
          <LoadingButton onPress={onRetryYears} variant="secondary">
            {MESSAGES.retryYears}
          </LoadingButton>
        </>
      ) : null}
      <PickerField hint={MESSAGES.periodHint} label={MESSAGES.period} onPress={() => setOpenSheet("period")} value={`${selectionName(selection, choices)}, ${selectionDates(selection)}`} />
      <PickerField disabled={!canCompare} hint={MESSAGES.compareHint} label={MESSAGES.compare} onPress={() => setOpenSheet("compare")} value={canCompare ? compareLabel : MESSAGES.compareNeedsDates} />
      <PropertyPickerField maxSelected={maxProperties} onChange={onPropertyIds} properties={properties} selectedIds={propertyIds} />
      {children}
      {openSheet === "period" ? (
        <AnalysisPeriodSheet
          choices={choices}
          onApply={(chosen) => {
            setOpenSheet(null);
            onSelection(chosen);
          }}
          onClose={() => setOpenSheet(null)}
          selection={selection}
          today={today}
        />
      ) : null}
      <OptionSheet
        isOpen={openSheet === "compare"}
        onClose={() => setOpenSheet(null)}
        onSelect={(chosen) => {
          setOpenSheet(null);
          onCompare(chosen);
        }}
        options={COMPARE_MODES.map((mode) => ({ value: mode.key, label: mode.label }))}
        title={MESSAGES.compareSheetTitle}
        value={compare}
      />
    </View>
  );
}
