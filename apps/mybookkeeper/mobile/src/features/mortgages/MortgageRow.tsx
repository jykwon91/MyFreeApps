import type { Mortgage } from "@mybookkeeper/api-client/types/mortgage/mortgage";
import { formatRatePct } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { Chip, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { MORTGAGE_MESSAGES } from "../../constants/mortgages";
import { balanceLine, mortgageTitle } from "./mortgageDisplay";

interface MortgageRowProps {
  mortgage: Mortgage;
  onPress: () => void;
}

export default function MortgageRow({ mortgage, onPress }: MortgageRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const rate = mortgage.interest_rate !== null ? formatRatePct(mortgage.interest_rate) : null;
  const lenderAndRate = [mortgage.lender, rate].filter(Boolean).join(" · ");
  const balance = balanceLine(mortgage);
  const isAdjustable = mortgage.rate_type === "arm";
  return (
    <Pressable
      accessibilityLabel={[mortgageTitle(mortgage), mortgage.lender, rate, balance, isAdjustable ? MORTGAGE_MESSAGES.adjustable : null].filter(Boolean).join(", ")}
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
      <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {mortgageTitle(mortgage)}
      </Text>
      {lenderAndRate ? (
        <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {lenderAndRate}
        </Text>
      ) : null}
      {balance ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{balance}</Text> : null}
      {isAdjustable ? (
        <View style={{ flexDirection: "row" }}>
          <Chip label={MORTGAGE_MESSAGES.adjustable} />
        </View>
      ) : null}
    </Pressable>
  );
}
