import { useGetLeaseTemplatesQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { Banner, EmptyState, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList, Text, View } from "react-native";
import { LEASE_TEMPLATE_LIST_LIMIT, LEASE_TEMPLATE_MESSAGES as MESSAGES } from "../../constants/leaseTemplates";
import { useCanWrite } from "../workspace/useCanWrite";
import LeaseTemplateRow from "./LeaseTemplateRow";
import LeaseTemplatesSkeleton from "./LeaseTemplatesSkeleton";

export default function LeaseTemplatesScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { currentData, error, isFetching, refetch } = useGetLeaseTemplatesQuery({ limit: LEASE_TEMPLATE_LIST_LIMIT });
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const rows = currentData?.items ?? [];
  const addTemplate = () => router.push("/lease-templates/new");

  const emptyList = !currentData && isFetching ? (
    <LeaseTemplatesSkeleton />
  ) : error ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoadList} />
  ) : (
    <EmptyState
      action={canWrite ? { label: MESSAGES.add, onPress: addTemplate } : undefined}
      body={canWrite ? MESSAGES.noneBody : MESSAGES.noneViewOnlyBody}
      heading={MESSAGES.noneHeading}
    />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        rows.length > 0 ? (
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {currentData?.has_more ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.moreThanShown}</Text> : null}
            {canWrite ? <LoadingButton onPress={addTemplate}>{MESSAGES.add}</LoadingButton> : null}
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
      keyExtractor={(template) => template.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <LeaseTemplateRow onPress={() => router.push(`/lease-templates/${item.id}`)} template={item} />}
      testID="lease-templates-list"
    />
  );
}
