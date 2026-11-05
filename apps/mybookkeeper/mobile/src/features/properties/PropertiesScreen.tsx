import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { FlatList, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { PROPERTY_MESSAGES } from "../../constants/properties";
import { useOpenLink } from "../inquiries/useOpenLink";
import PropertiesSkeleton from "./PropertiesSkeleton";
import { classifyPrompt, needsClassification } from "./propertyDisplay";
import PropertyRow from "./PropertyRow";

export default function PropertiesScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const { currentData, error, isFetching, refetch } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const properties = currentData ?? [];
  const waiting = properties.filter(needsClassification).length;
  const openWebsite = () => void openLink(`${WEB_BASE_URL}/properties`);

  const emptyList = isFetching ? (
    <PropertiesSkeleton />
  ) : error ? (
    <EmptyState
      action={{ label: PROPERTY_MESSAGES.tryAgain, onPress: refresh }}
      body={PROPERTY_MESSAGES.tryAgainOffer}
      heading={PROPERTY_MESSAGES.couldntLoad}
    />
  ) : (
    <EmptyState
      action={{ label: PROPERTY_MESSAGES.openWebsite, onPress: openWebsite }}
      body={PROPERTY_MESSAGES.noneBody}
      heading={PROPERTY_MESSAGES.noneHeading}
    />
  );

  const hasHeader = (error && properties.length > 0) || waiting > 0;

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        properties.length > 0 ? (
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{PROPERTY_MESSAGES.manageOnWebsite}</Text>
            <LoadingButton onPress={openWebsite} variant="ghost">
              {PROPERTY_MESSAGES.openWebsite}
            </LoadingButton>
          </View>
        ) : undefined
      }
      ListHeaderComponent={
        hasHeader ? (
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {error && properties.length > 0 ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            {waiting > 0 ? (
              <Banner
                actions={[{ label: PROPERTY_MESSAGES.classifyOnWebsite, onPress: openWebsite }]}
                message={classifyPrompt(waiting)}
                tone="success"
              />
            ) : null}
          </View>
        ) : undefined
      }
      contentInsetAdjustmentBehavior="automatic"
      data={properties}
      keyExtractor={(property) => property.id}
      refreshControl={refreshControl}
      testID="properties-list"
      renderItem={({ item }) => <PropertyRow property={item} />}
    />
  );
}
