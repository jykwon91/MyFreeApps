import type { SignedLeaseStatus } from "@mybookkeeper/api-client/types/lease/signed-lease-status";
import { Chip, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { leaseCountdown, leaseIsInEffect, leaseStatusLabel, leaseTerm } from "./leaseDisplay";

interface LeaseRowProps {
  /** Left out on a tenant's own page, where the name is already at the top. */
  name?: string;
  status: SignedLeaseStatus;
  startsOn: string | null;
  endsOn: string | null;
  isInset?: boolean;
  onPress: () => void;
}

export default function LeaseRow({ name, status, startsOn, endsOn, isInset = false, onPress }: LeaseRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const term = leaseTerm(startsOn, endsOn);
  const countdown = leaseCountdown(status, endsOn);
  const label = leaseStatusLabel(status);
  const secondaryText = { fontSize: fontSize.sm, color: colors.mutedForeground };

  return (
    <Pressable
      accessibilityLabel={[name, label, term, countdown].filter(Boolean).join(", ")}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: isInset ? 0 : spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      {name ? (
        <Text numberOfLines={1} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {name}
        </Text>
      ) : null}
      <Text style={name ? secondaryText : { fontSize: fontSize.md, color: colors.foreground }}>{term}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }}>
        {leaseIsInEffect(status) ? null : <Chip label={label} />}
        {countdown ? <Text style={secondaryText}>{countdown}</Text> : null}
      </View>
    </Pressable>
  );
}
