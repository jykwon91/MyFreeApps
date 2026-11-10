import { Banner, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, SegmentedControl, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RECONCILIATION_MESSAGES as MESSAGES } from "../../constants/reconciliation";
import type { ReconciliationFilter } from "../../types/ReconciliationFilter";
import PickerField from "../transactions/PickerField";

interface ReconciliationHeaderProps {
  year: number;
  filter: ReconciliationFilter;
  totalCount: number;
  needsLookCount: number;
  canWrite: boolean;
  isComparing: boolean;
  showLastLoaded: boolean;
  onChangeFilter: (filter: ReconciliationFilter) => void;
  onChooseYear: () => void;
  onAdd: () => void;
  onCompare: () => void;
}

export default function ReconciliationHeader({
  year,
  filter,
  totalCount,
  needsLookCount,
  canWrite,
  isComparing,
  showLastLoaded,
  onChangeFilter,
  onChooseYear,
  onAdd,
  onCompare,
}: ReconciliationHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }}>
      {showLastLoaded ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {canWrite ? null : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.viewOnly}</Text>}
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.infoNote}</Text>
      <PickerField hint={MESSAGES.taxYearHint} label={MESSAGES.taxYear} onPress={onChooseYear} value={String(year)} />
      {totalCount > 0 ? (
        <>
          <SegmentedControl
            accessibilityLabel={MESSAGES.filterLabel}
            onChange={onChangeFilter}
            segments={[
              { value: "all", label: `${MESSAGES.all}, ${totalCount}` },
              { value: "needsLook", label: `${MESSAGES.needsLook}, ${needsLookCount}` },
            ]}
            value={filter}
          />
          {canWrite ? (
            <>
              <LoadingButton
                accessibilityHint={MESSAGES.compareHint}
                disabled={isComparing}
                isLoading={isComparing}
                loadingText={MESSAGES.comparing}
                onPress={onCompare}
              >
                {MESSAGES.compare}
              </LoadingButton>
              <LoadingButton accessibilityHint={MESSAGES.addHint} disabled={isComparing} onPress={onAdd} variant="secondary">
                {MESSAGES.add}
              </LoadingButton>
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
