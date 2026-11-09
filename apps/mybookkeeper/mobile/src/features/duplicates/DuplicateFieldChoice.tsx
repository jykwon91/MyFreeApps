import type { DuplicateTransaction } from "@mybookkeeper/api-client/types/transaction/DuplicateTransaction";
import type { MergeableField } from "@mybookkeeper/api-client/types/transaction/MergeableField";
import type { MergeFieldSide } from "@mybookkeeper/api-client/types/transaction/MergeFieldSide";
import { FIELD_LABELS } from "@mybookkeeper/api-client/constants/mergeableTransactionFields";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { DUPLICATES_MESSAGES as MESSAGES } from "../../constants/duplicates";
import { duplicateSideLabel } from "./duplicateDisplay";

const SIDES: readonly MergeFieldSide[] = ["a", "b"];

/** Which record's value to keep for one field. Stacked, so a long value gets the whole width. */
export default function DuplicateFieldChoice({
  field,
  txnA,
  txnB,
  valueA,
  valueB,
  selected,
  onSelect,
  disabled,
}: {
  field: MergeableField;
  txnA: DuplicateTransaction;
  txnB: DuplicateTransaction;
  valueA: string | null;
  valueB: string | null;
  selected: MergeFieldSide;
  onSelect: (side: MergeFieldSide) => void;
  disabled: boolean;
}) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const showAmountWarning = field === "amount" && txnA.amount !== txnB.amount;
  return (
    <View accessibilityLabel={FIELD_LABELS[field]} accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.mutedForeground }}>{FIELD_LABELS[field]}</Text>
      {showAmountWarning ? <Text style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>{MESSAGES.amountsDiffer}</Text> : null}
      {SIDES.map((side) => {
        const txn = side === "a" ? txnA : txnB;
        const value = (side === "a" ? valueA : valueB) ?? "—";
        const isSelected = selected === side;
        return (
          <Pressable
            accessibilityLabel={`${duplicateSideLabel(side, txn)}, ${value}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected, disabled }}
            disabled={disabled}
            key={side}
            onPress={() => onSelect(side)}
            style={{
              minHeight: MIN_TOUCH_TARGET,
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.md,
              borderWidth: isSelected ? 2 : 1,
              borderColor: isSelected ? colors.primary : colors.border,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{duplicateSideLabel(side, txn)}</Text>
              <Text style={{ fontSize: fontSize.md, fontWeight: isSelected ? "600" : "400", color: colors.foreground }}>{value}</Text>
            </View>
            {isSelected ? <Text style={{ fontSize: fontSize.md, color: colors.primary }}>✓</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
