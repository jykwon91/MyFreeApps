import { Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import type { LoadMoreFooterProps } from "../types/LoadMoreFooterProps";
import LoadingButton from "./LoadingButton";

/** Under a paged list: how many are showing, and a button for the next page. Render it only while there is one. */
export default function LoadMoreFooter({ shown, total, isLoading, isError, onLoadMore, messages }: LoadMoreFooterProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: colors.mutedForeground, textAlign: "center" }}>
        {messages.showingCount(shown, total)}
      </Text>
      {isError && !isLoading ? (
        <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: colors.destructiveText, textAlign: "center" }}>
          {messages.couldntLoadMore}
        </Text>
      ) : null}
      <LoadingButton isLoading={isLoading} loadingText={messages.loadingMore} onPress={onLoadMore} variant="secondary">
        {isError ? messages.tryAgain : messages.loadMore}
      </LoadingButton>
    </View>
  );
}
