import { type AccountMessage, AccountSection, SearchField, Toast, useDevices, useTheme } from "@platform/mobile";
import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ALL_DESTINATIONS } from "../../constants/allDestinations";
import { MORE_MENU } from "../../constants/moreMenu";
import { MORE_SEARCH_ANNOUNCE_DELAY_MS, MORE_SEARCH_MESSAGES } from "../../constants/moreSearch";
import { useDebouncedAnnouncement } from "../../lib/useDebouncedAnnouncement";
import { useKeyboardHeight } from "../../lib/useKeyboardHeight";
import { filterDestinations, flattenDestinations, visibleGroups } from "../../utils/destinationSearch";
import { useCanWrite } from "../workspace/useCanWrite";
import { useIsAdmin } from "../workspace/useIsAdmin";
import MoreRow from "./MoreRow";
import MoreSearchResults from "./MoreSearchResults";

export default function MoreScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const devices = useDevices();
  const { reload } = devices;
  const [message, setMessage] = useState<AccountMessage | null>(null);
  const isAdmin = useIsAdmin();
  const canWrite = useCanWrite();
  const keyboardHeight = useKeyboardHeight();
  const viewer = useMemo(() => ({ isAdmin, canWrite }), [isAdmin, canWrite]);
  const [query, setQuery] = useState("");
  const results = useMemo(() => filterDestinations(flattenDestinations(ALL_DESTINATIONS, viewer), query), [viewer, query]);
  const isSearching = query.trim() !== "";
  useDebouncedAnnouncement(isSearching ? MORE_SEARCH_MESSAGES.count(results.length) : undefined, MORE_SEARCH_ANNOUNCE_DELAY_MS);
  const version = Constants.expoConfig?.version;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

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
        {(isSearching ? [] : visibleGroups(MORE_MENU, viewer)).map((group) => (
          <View key={group.title}>
            <Text
              accessibilityRole="header"
              style={{ color: colors.mutedForeground, fontSize: fontSize.sm, fontWeight: "700", marginBottom: spacing.xs }}
            >
              {group.title}
            </Text>
            {group.items.map((item) => (
              <MoreRow item={item} key={item.label} />
            ))}
          </View>
        ))}
        {isSearching ? null : (
          <>
            <AccountSection
              appName="MyBookkeeper"
              devices={devices}
              onDeleteAccount={() => router.push("/delete-account")}
              onMessage={setMessage}
            />
            {version ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>Version {version}</Text> : null}
          </>
        )}
      </ScrollView>
      {message ? <Toast message={message.message} onDismiss={() => setMessage(null)} style={{ marginBottom: keyboardHeight }} variant={message.variant} /> : null}
    </View>
  );
}
