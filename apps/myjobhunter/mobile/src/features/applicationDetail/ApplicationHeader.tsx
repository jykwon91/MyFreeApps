import { KANBAN_COLUMN_LABELS } from "@myjobhunter/api-client/constants/kanbanColumnLabels";
import { KANBAN_COLUMN_TONES } from "@myjobhunter/api-client/constants/kanbanColumnTones";
import { APPLICATION_COMPANY_MESSAGES as COMPANY } from "@myjobhunter/api-client/constants/applicationCompanyMessages";
import { formatRemoteType } from "@myjobhunter/api-client/utils/formatRemoteType";
import { Chip, LoadingRegion, SectionError, Skeleton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { APPLICATION_DETAIL_MESSAGES as MESSAGES } from "../../constants/applicationDetail";
import type { ApplicationHeaderProps } from "../../types/ApplicationHeaderProps";

/** The role, the company, and chips for its stage, whether it's archived, and how remote it is. */
export default function ApplicationHeader({ application, column, companyName, companyFailed, onRetryCompany }: ApplicationHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  const remote = formatRemoteType(application.remote_type);

  function companyLine() {
    if (companyName !== null) return <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{companyName}</Text>;
    if (companyFailed) return <SectionError message={COMPANY.couldntLoad} onRetry={onRetryCompany} retryLabel={COMPANY.tryAgain} />;
    return (
      <LoadingRegion label={COMPANY.loading}>
        <Skeleton height={20} testID="company-skeleton" width="40%" />
      </LoadingRegion>
    );
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
        {application.role_title}
      </Text>
      {companyLine()}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingTop: spacing.xs }}>
        <Chip label={KANBAN_COLUMN_LABELS[column]} tone={KANBAN_COLUMN_TONES[column]} />
        {application.archived ? <Chip label={MESSAGES.archived} /> : null}
        {remote ? <Chip label={remote} tone="info" /> : null}
      </View>
    </View>
  );
}
