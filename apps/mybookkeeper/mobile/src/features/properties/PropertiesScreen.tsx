import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { Banner, EmptyState, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList, View } from "react-native";
import { PROPERTY_MESSAGES } from "../../constants/properties";
import { useCanWrite } from "../workspace/useCanWrite";
import PropertiesSkeleton from "./PropertiesSkeleton";
import { classifyPrompt, needsClassification } from "./propertyDisplay";
import PropertyRow from "./PropertyRow";

export default function PropertiesScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const { currentData, error, isFetching, refetch } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const properties = currentData ?? [];
  const waiting = properties.filter(needsClassification);
  const addProperty = () => router.push("/properties/new");

  const emptyList = !currentData && isFetching ? (
    <PropertiesSkeleton />
  ) : error ? (
    <EmptyState
      action={{ label: PROPERTY_MESSAGES.tryAgain, onPress: refresh }}
      body={PROPERTY_MESSAGES.tryAgainOffer}
      heading={PROPERTY_MESSAGES.couldntLoad}
    />
  ) : (
    <EmptyState
      action={canWrite ? { label: PROPERTY_MESSAGES.add, onPress: addProperty } : undefined}
      body={canWrite ? PROPERTY_MESSAGES.noneBody : PROPERTY_MESSAGES.noneViewOnlyBody}
      heading={PROPERTY_MESSAGES.noneHeading}
    />
  );

  const showsAdd = canWrite && properties.length > 0;
  const hasHeader = (error && properties.length > 0) || waiting.length > 0 || showsAdd;

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListHeaderComponent={
        hasHeader ? (
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {error && properties.length > 0 ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            {waiting.length > 0 ? (
              <Banner
                actions={canWrite ? [{ label: PROPERTY_MESSAGES.classify, onPress: () => router.push(`/properties/${waiting[0].id}/edit`) }] : undefined}
                message={classifyPrompt(waiting.length)}
                tone="success"
              />
            ) : null}
            {showsAdd ? (
              <LoadingButton onPress={addProperty} variant="secondary">
                {PROPERTY_MESSAGES.add}
              </LoadingButton>
            ) : null}
          </View>
        ) : undefined
      }
      contentInsetAdjustmentBehavior="automatic"
      data={properties}
      keyExtractor={(property) => property.id}
      refreshControl={refreshControl}
      testID="properties-list"
      renderItem={({ item }) => <PropertyRow onPress={() => router.push(`/properties/${item.id}`)} property={item} />}
    />
  );
}
