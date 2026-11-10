import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";
import { Chip, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { applicantName, applicantRowDetails, applicantRowLabel, applicantStageLabel, promotedAgo } from "./applicantDisplay";

export default function ApplicantRow({
  applicant,
  showStage,
  onPress,
}: {
  applicant: ApplicantSummary;
  showStage: boolean;
  onPress: () => void;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const details = applicantRowDetails(applicant);

  return (
    <Pressable
      accessibilityLabel={applicantRowLabel(applicant)}
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
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {applicantName(applicant.legal_name)}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{promotedAgo(applicant.created_at)}</Text>
      </View>
      {details ? (
        <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {details}
        </Text>
      ) : null}
      {showStage ? <Chip label={applicantStageLabel(applicant.stage)} /> : null}
    </Pressable>
  );
}
