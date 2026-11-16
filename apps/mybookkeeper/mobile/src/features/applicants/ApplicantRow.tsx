import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";
import { Chip, ListRowTitle, MIN_TOUCH_TARGET, useLargeText, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
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
  const isLargeText = useLargeText();
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
      <ListRowTitle
        aside={<Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{promotedAgo(applicant.created_at)}</Text>}
        title={applicantName(applicant.legal_name)}
      />
      {details ? (
        <Text numberOfLines={isLargeText ? undefined : 1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {details}
        </Text>
      ) : null}
      {showStage ? <Chip label={applicantStageLabel(applicant.stage)} /> : null}
    </Pressable>
  );
}
