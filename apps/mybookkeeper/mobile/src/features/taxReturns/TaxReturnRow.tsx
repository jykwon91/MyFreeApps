import type { TaxReturn } from "@mybookkeeper/api-client/types/tax/TaxReturn";
import { TAX_RETURN_STATUS_LABELS } from "@mybookkeeper/api-client/constants/taxReturnLabels";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { TAX_RETURNS_MESSAGES as MESSAGES } from "../../constants/taxReturns";
import { timeSince } from "@platform/core/utils/timeSince";
import { taxReturnTitle } from "./taxReturnDisplay";

export default function TaxReturnRow({ taxReturn, onPress }: { taxReturn: TaxReturn; onPress: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const title = taxReturnTitle(taxReturn);
  const status = TAX_RETURN_STATUS_LABELS[taxReturn.status];
  const updated = MESSAGES.updated(timeSince(taxReturn.updated_at));
  const outOfDate = taxReturn.needs_recompute ? MESSAGES.outOfDate : null;
  return (
    <Pressable
      accessibilityLabel={[title, status, outOfDate, updated].filter(Boolean).join(", ")}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{title}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`${status} · ${updated}`}</Text>
      {outOfDate ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{outOfDate}</Text> : null}
    </Pressable>
  );
}
