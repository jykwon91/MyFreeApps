import { useGetReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import { useOpenLink } from "../inquiries/useOpenLink";
import ReplyTemplateRow from "./ReplyTemplateRow";
import ReplyTemplatesSkeleton from "./ReplyTemplatesSkeleton";

export default function ReplyTemplatesScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const { currentData, error, isFetching, refetch } = useGetReplyTemplatesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const rows = currentData ?? [];
  const openWebsite = () => void openLink(`${WEB_BASE_URL}/reply-templates`);

  const emptyList = !currentData && isFetching ? (
    <ReplyTemplatesSkeleton />
  ) : error ? (
    <EmptyState
      action={{ label: REPLY_TEMPLATE_MESSAGES.tryAgain, onPress: refresh }}
      body={REPLY_TEMPLATE_MESSAGES.tryAgainOffer}
      heading={REPLY_TEMPLATE_MESSAGES.couldntLoadList}
    />
  ) : (
    <EmptyState
      action={{ label: REPLY_TEMPLATE_MESSAGES.openWebsite, onPress: openWebsite }}
      body={REPLY_TEMPLATE_MESSAGES.noneBody}
      heading={REPLY_TEMPLATE_MESSAGES.noneHeading}
    />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListFooterComponent={
        rows.length > 0 ? (
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{REPLY_TEMPLATE_MESSAGES.manageOnWebsite}</Text>
            <LoadingButton onPress={openWebsite} variant="ghost">
              {REPLY_TEMPLATE_MESSAGES.openWebsite}
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
      renderItem={({ item }) => <ReplyTemplateRow onPress={() => router.push(`/reply-templates/${item.id}`)} template={item} />}
      testID="reply-templates-list"
    />
  );
}
