import { Banner, SegmentedControl, useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { Text, View } from "react-native";
import { UTILITY_COSTS_MESSAGES as MESSAGES, UTILITY_COSTS_PRESETS } from "../../constants/analytics";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import type { UtilityCostRow } from "../../types/UtilityCostRow";
import type { UtilityCostsPreset } from "../../types/UtilityCostsPreset";
import { spokenMoney } from "../transactions/transactionDisplay";
import PickerField from "../transactions/PickerField";
import UtilityCostRowView from "./UtilityCostRowView";

interface UtilityCostsHeaderProps {
  preset: UtilityCostsPreset;
  propertiesFailed: boolean;
  propertyName: string | null;
  showLastLoaded: boolean;
  rows: readonly UtilityCostRow[] | null;
  totalCents: number;
  range: string;
  onChangePreset: (preset: UtilityCostsPreset) => void;
  onChooseProperty: () => void;
}

export default function UtilityCostsHeader({
  preset,
  propertiesFailed,
  propertyName,
  showLastLoaded,
  rows,
  totalCents,
  range,
  onChangePreset,
  onChooseProperty,
}: UtilityCostsHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  const dollars = totalCents / 100;
  const sectionTitle = { fontSize: fontSize.md, fontWeight: "600", color: colors.foreground } as const;
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }}>
      {showLastLoaded ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <SegmentedControl accessibilityLabel={MESSAGES.rangeLabel} onChange={onChangePreset} segments={UTILITY_COSTS_PRESETS} value={preset} />
      {propertyName ? <PickerField hint={MESSAGES.propertyHint} label={MESSAGES.property} onPress={onChooseProperty} value={propertyName} /> : null}
      {propertiesFailed ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.propertiesFailed}</Text> : null}
      {rows && rows.length > 0 ? (
        <>
          <View accessible accessibilityLabel={`I've seen ${spokenMoney(dollars)} in utilities, ${range}. ${MESSAGES.approvedOnly}`} style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: fontSize.xl, fontWeight: "700", color: colors.foreground }}>I've seen {formatCurrency(dollars)} in utilities</Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{range}</Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.approvedOnly}</Text>
          </View>
          <Text accessibilityRole="header" style={sectionTitle}>
            {MESSAGES.byUtility}
          </Text>
          {rows.map((row) => (
            <UtilityCostRowView key={row.subCategory} row={row} totalCents={totalCents} />
          ))}
          <Text accessibilityRole="header" style={sectionTitle}>
            {MESSAGES.byMonth}
          </Text>
        </>
      ) : null}
    </View>
  );
}
