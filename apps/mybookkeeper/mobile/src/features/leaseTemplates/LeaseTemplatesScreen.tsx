import { useGetLeaseTemplatesQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { LEASE_TEMPLATE_LIST_LIMIT, LEASE_TEMPLATE_MESSAGES as MESSAGES } from "../../constants/leaseTemplates";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useOpenLink } from "../inquiries/useOpenLink";
import LeaseTemplateRow from "./LeaseTemplateRow";
import LeaseTemplatesSkeleton from "./LeaseTemplatesSkeleton";

export default function LeaseTemplatesScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const { currentData, error, isFetching, refetch } = useGetLeaseTemplatesQuery({ limit: LEASE_TEMPLATE_LIST_LIMIT });
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const rows = currentData?.items ?? [];
  const openWebsite = () => void openLink(`${WEB_BASE_URL}/lease-templates`);

  const emptyList = !currentData && isFetching ? (
    <LeaseTemplatesSkeleton />
  ) : error ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoadList} />
  ) : (
    <EmptyState action={{ label: MESSAGES.openWebsite, onPress: openWebsite }} body={MESSAGES.noneBody} heading={MESSAGES.noneHeading} />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        rows.length > 0 ? (
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
              {currentData?.has_more ? MESSAGES.moreOnWebsite : MESSAGES.manageOnWebsite}
            </Text>
            <LoadingButton accessibilityLabel={MESSAGES.openListOnWebsite} onPress={openWebsite} variant="ghost">
              {MESSAGES.openWebsite}
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
      keyExtractor={(template) => template.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => <LeaseTemplateRow onPress={() => router.push(`/lease-templates/${item.id}`)} template={item} />}
      testID="lease-templates-list"
    />
  );
}
