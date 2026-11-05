import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useGetWelcomeManualsQuery } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { WELCOME_MANUAL_LIST_LIMIT, WELCOME_MANUAL_MESSAGES } from "../../constants/welcomeManuals";
import { useOpenLink } from "../inquiries/useOpenLink";
import { manualPropertyName } from "./welcomeManualDisplay";
import WelcomeManualRow from "./WelcomeManualRow";
import WelcomeManualsSkeleton from "./WelcomeManualsSkeleton";

export default function WelcomeManualsScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const { currentData, error, isFetching, refetch } = useGetWelcomeManualsQuery({ limit: WELCOME_MANUAL_LIST_LIMIT });
  const { currentData: properties } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const rows = currentData?.items ?? [];
  const openWebsite = () => void openLink(`${WEB_BASE_URL}/welcome-manuals`);

  const emptyList = isFetching ? (
    <WelcomeManualsSkeleton />
  ) : error ? (
    <EmptyState
      action={{ label: WELCOME_MANUAL_MESSAGES.tryAgain, onPress: refresh }}
      body={WELCOME_MANUAL_MESSAGES.tryAgainOffer}
      heading={WELCOME_MANUAL_MESSAGES.couldntLoadList}
    />
  ) : (
    <EmptyState
      action={{ label: WELCOME_MANUAL_MESSAGES.openWebsite, onPress: openWebsite }}
      body={WELCOME_MANUAL_MESSAGES.noneBody}
      heading={WELCOME_MANUAL_MESSAGES.noneHeading}
    />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        rows.length > 0 ? (
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
              {currentData?.has_more ? WELCOME_MANUAL_MESSAGES.moreOnWebsite : WELCOME_MANUAL_MESSAGES.manageOnWebsite}
            </Text>
            <LoadingButton onPress={openWebsite} variant="ghost">
              {WELCOME_MANUAL_MESSAGES.openWebsite}
            </LoadingButton>
          </View>
        ) : undefined
      }
      ListHeaderComponent={
        error && rows.length > 0 ? (
          <View style={{ padding: spacing.lg }}>
            <Banner message={SHOWING_LAST_LOADED_MESSAGE} />
          </View>
        ) : undefined
      }
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(manual) => manual.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <WelcomeManualRow
          manual={item}
          onPress={() => router.push(`/welcome-manuals/${item.id}`)}
          propertyName={manualPropertyName(item.property_id, properties)}
        />
      )}
      testID="welcome-manuals-list"
    />
  );
}
