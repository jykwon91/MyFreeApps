import { useState } from "react";
import { RefreshControl } from "react-native";
import { useTheme } from "../theme/useTheme";

/** Pull to refresh for a query, and whether its latest error has been dismissed. */
export function useRefresh(refetch: () => unknown, error: unknown) {
  const { colors } = useTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dismissedError, setDismissedError] = useState<unknown>();

  async function refresh(): Promise<void> {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }

  return {
    dismissError: () => setDismissedError(error),
    isErrorDismissed: error === dismissedError,
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
