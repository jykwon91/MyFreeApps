import { useState } from "react";
import { RefreshControl } from "react-native";
import { useTheme } from "../theme/useTheme";

/**
 * Pull to refresh for a screen, given its query's error, or every error of a screen that refreshes
 * several queries. hasError is whether any of them failed; isErrorDismissed whether the failures
 * now showing are the ones the user dismissed.
 */
export function useRefresh(refetch: () => unknown, error: unknown) {
  const { colors } = useTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dismissedErrors, setDismissedErrors] = useState<readonly unknown[]>([]);
  const errors: readonly unknown[] = Array.isArray(error) ? error : [error];

  async function refresh(): Promise<void> {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }

  return {
    dismissError: () => setDismissedErrors(errors),
    hasError: errors.some(Boolean),
    isErrorDismissed: errors.every((each, index) => each === dismissedErrors[index]),
    isRefreshing,
    refresh,
    refreshControl: (
      <RefreshControl
        colors={[colors.primary]}
        onRefresh={refresh}
        progressBackgroundColor={colors.card}
        refreshing={isRefreshing}
        tintColor={colors.mutedForeground}
      />
    ),
  };
}
