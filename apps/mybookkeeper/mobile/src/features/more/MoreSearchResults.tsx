import { EmptyState, MoreRow, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { MORE_ACCOUNT_HREF, MORE_SEARCH_MESSAGES } from "../../constants/moreSearch";
import type { MoreSearchResultsProps } from "../../types/MoreSearchResultsProps";

export default function MoreSearchResults({ query, results, onShowAccount }: MoreSearchResultsProps) {
  const { colors, fontSize } = useTheme();
  return (
    <View>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>
        {MORE_SEARCH_MESSAGES.count(results.length)}
      </Text>
      {results.length === 0 ? (
        <EmptyState body={MORE_SEARCH_MESSAGES.emptyBody} heading={MORE_SEARCH_MESSAGES.emptyHeading(query.trim())} />
      ) : (
        results.map(({ item, groupTitle }) => (
          <MoreRow
            item={item}
            key={String(item.screen ?? item.webPath)}
            onPress={item.screen === MORE_ACCOUNT_HREF ? onShowAccount : undefined}
            secondary={groupTitle}
            webBaseUrl={WEB_BASE_URL}
          />
        ))
      )}
    </View>
  );
}
