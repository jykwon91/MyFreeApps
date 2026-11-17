import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";
import { tenancyState } from "@mybookkeeper/api-client/utils/tenancyState";
import { Chip, ClampedText, ListRowTitle, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { TENANT_MESSAGES } from "../../constants/tenants";
import { tenancyLine, tenancyStateLabel, tenantRowLabel } from "./tenantDisplay";

export default function TenantRow({ tenant, onPress }: { tenant: ApplicantSummary; onPress: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const name = tenant.legal_name ?? TENANT_MESSAGES.unnamed;
  const state = tenancyState(tenant);
  const employer = tenant.employer_or_hospital?.trim();
  const line = tenancyLine(tenant);

  return (
    <Pressable
      accessibilityLabel={tenantRowLabel(tenant, name)}
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
      <ListRowTitle aside={line ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{line}</Text> : null} title={name} />
      {employer ? (
        <ClampedText numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {employer}
        </ClampedText>
      ) : null}
      {state === "active" ? null : <Chip label={tenancyStateLabel(state)} />}
    </Pressable>
  );
}
