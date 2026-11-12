import { AccountSettings, AppVersion, MoreMenuGroups, SearchField, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { ALL_DESTINATIONS } from "../../constants/allDestinations";
import { MORE_MENU } from "../../constants/moreMenu";
import { MORE_SEARCH_ANNOUNCE_DELAY_MS, MORE_SEARCH_MESSAGES } from "../../constants/moreSearch";
import { useDebouncedAnnouncement } from "../../lib/useDebouncedAnnouncement";
import { filterDestinations, flattenDestinations, visibleGroups } from "../../utils/destinationSearch";
import { useCanWrite } from "../workspace/useCanWrite";
import { useIsAdmin } from "../workspace/useIsAdmin";
import MoreSearchResults from "./MoreSearchResults";

export default function MoreScreen() {
  const { colors, spacing } = useTheme();
  const isAdmin = useIsAdmin();
  const canWrite = useCanWrite();
  const viewer = useMemo(() => ({ isAdmin, canWrite }), [isAdmin, canWrite]);
  const [query, setQuery] = useState("");
  const results = useMemo(() => filterDestinations(flattenDestinations(ALL_DESTINATIONS, viewer), query), [viewer, query]);
  const isSearching = query.trim() !== "";
  useDebouncedAnnouncement(isSearching ? MORE_SEARCH_MESSAGES.count(results.length) : undefined, MORE_SEARCH_ANNOUNCE_DELAY_MS);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
        testID="more-scroll"
      >
        <View style={{ backgroundColor: colors.background, paddingBottom: spacing.xs }}>
          <SearchField
            accessibilityLabel={MORE_SEARCH_MESSAGES.label}
            onChangeText={setQuery}
            onClear={() => setQuery("")}
            placeholder={MORE_SEARCH_MESSAGES.placeholder}
            value={query}
          />
        </View>
        {isSearching ? <MoreSearchResults onShowAccount={() => setQuery("")} query={query} results={results} /> : null}
        {isSearching ? null : <MoreMenuGroups groups={visibleGroups(MORE_MENU, viewer)} webBaseUrl={WEB_BASE_URL} />}
        {isSearching ? null : (
          <>
            <AccountSettings appName="MyBookkeeper" onDeleteAccount={() => router.push("/delete-account")} />
            <AppVersion />
          </>
        )}
      </ScrollView>
    </View>
  );
}
