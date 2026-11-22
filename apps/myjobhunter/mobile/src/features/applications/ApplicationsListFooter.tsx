import { applicationsShowingCount } from "@myjobhunter/api-client/constants/applicationsListMessages";
import { Banner, LoadingRegion, useAnnouncement, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { APPLICATION_FOOTER_SKELETON_ROWS, APPLICATION_MESSAGES as MESSAGES } from "../../constants/applications";
import type { ApplicationsListFooterProps } from "../../types/ApplicationsListFooterProps";
import ApplicationSkeletonRow from "./ApplicationSkeletonRow";

/** Under the rows: how many are showing of the total, skeleton rows while the next page loads, or why it didn't with a way to retry. */
export default function ApplicationsListFooter({ isLoadingMore, isLoadMoreError, shown, total, onRetry }: ApplicationsListFooterProps) {
  const { colors, spacing, fontSize } = useTheme();
  const count = total !== undefined && shown > 0 ? applicationsShowingCount(shown, total) : undefined;
  useAnnouncement(count, "polite", { onChangeOnly: true });
  return (
    <View>
      {count ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground, textAlign: "center", padding: spacing.md }}>{count}</Text>
      ) : null}
      {isLoadingMore ? (
        <LoadingRegion label={MESSAGES.loadingMore} testID="applications-footer-skeleton">
          {APPLICATION_FOOTER_SKELETON_ROWS.map((row) => (
            <ApplicationSkeletonRow key={row} />
          ))}
        </LoadingRegion>
      ) : isLoadMoreError ? (
        <View style={{ padding: spacing.lg }}>
          <Banner actions={[{ label: MESSAGES.tryAgain, onPress: onRetry }]} message={MESSAGES.couldntLoadMore} />
        </View>
      ) : null}
    </View>
  );
}
