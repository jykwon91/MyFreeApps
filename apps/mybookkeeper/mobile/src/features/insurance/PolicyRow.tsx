import type { InsurancePolicySummary } from "@mybookkeeper/api-client/types/insurance/insurance-policy-summary";
import { formatAnnualPremium } from "@mybookkeeper/api-client/utils/insurancePolicyFormat";
import { Chip, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { expiryLabel, policyPlace, policyRowLabel } from "./policyDisplay";

interface PolicyRowProps {
  policy: InsurancePolicySummary;
  todayIso: string;
  onPress: () => void;
}

export default function PolicyRow({ policy, todayIso, onPress }: PolicyRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const place = policyPlace(policy);
  const expiry = expiryLabel(policy.expiration_date, todayIso);
  return (
    <Pressable
      accessibilityLabel={policyRowLabel(policy, todayIso)}
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
        {policy.policy_name}
      </Text>
      {place ? (
        <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {place}
        </Text>
      ) : null}
      {policy.annual_premium_cents !== null ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{formatAnnualPremium(policy.annual_premium_cents)}</Text>
      ) : null}
      {expiry ? (
        <View style={{ flexDirection: "row" }}>
          <Chip label={expiry} />
        </View>
      ) : null}
    </Pressable>
  );
}
