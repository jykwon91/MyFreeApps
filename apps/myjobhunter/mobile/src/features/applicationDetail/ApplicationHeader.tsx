import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import { formatRemoteType } from "@myjobhunter/api-client/utils/formatRemoteType";
import { Chip, Skeleton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { APPLICATION_DETAIL_MESSAGES as MESSAGES } from "../../constants/applicationDetail";
import type { ApplicationHeaderProps } from "../../types/ApplicationHeaderProps";

/** The role, the company, and chips for its stage, whether it's archived, and how remote it is. */
export default function ApplicationHeader({ application, column, companyName }: ApplicationHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  const remote = formatRemoteType(application.remote_type);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
        {application.role_title}
      </Text>
      {companyName === null ? (
        <Skeleton height={20} testID="company-skeleton" width="40%" />
      ) : (
        <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{companyName}</Text>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingTop: spacing.xs }}>
        <Chip label={KANBAN_COLUMN_LABELS[column]} />
        {application.archived ? <Chip label={MESSAGES.archived} /> : null}
        {remote ? <Chip label={remote} /> : null}
      </View>
    </View>
  );
}
