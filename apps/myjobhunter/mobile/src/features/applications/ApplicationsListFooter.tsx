import { Banner, LoadingRegion, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { APPLICATION_FOOTER_SKELETON_ROWS, APPLICATION_MESSAGES as MESSAGES } from "../../constants/applications";
import type { ApplicationsListFooterProps } from "../../types/ApplicationsListFooterProps";
import ApplicationSkeletonRow from "./ApplicationSkeletonRow";

/** Under the rows: skeleton rows while the next page loads, or why it didn't with a way to retry. */
export default function ApplicationsListFooter({ isLoadingMore, isLoadMoreError, onRetry }: ApplicationsListFooterProps) {
  const { spacing } = useTheme();
  if (isLoadingMore) {
    return (
      <LoadingRegion label={MESSAGES.loadingMore} testID="applications-footer-skeleton">
        {APPLICATION_FOOTER_SKELETON_ROWS.map((row) => (
          <ApplicationSkeletonRow key={row} />
        ))}
      </LoadingRegion>
    );
  }
  if (isLoadMoreError) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Banner actions={[{ label: MESSAGES.tryAgain, onPress: onRetry }]} message={MESSAGES.couldntLoadMore} />
      </View>
    );
  }
  return null;
}
