import { useGetArchivedReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { Banner, EmptyState, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import { useCanWrite } from "../workspace/useCanWrite";
import ReplyTemplateRow from "./ReplyTemplateRow";
import ReplyTemplatesSkeleton from "./ReplyTemplatesSkeleton";

export default function ArchivedReplyTemplatesScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { currentData, error, isFetching, refetch } = useGetArchivedReplyTemplatesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const rows = currentData ?? [];
  const showsBanner = Boolean(error) && rows.length > 0;

  const emptyList = !currentData && isFetching ? (
    <ReplyTemplatesSkeleton hasHeader label={REPLY_TEMPLATE_MESSAGES.loadingArchived} />
  ) : error ? (
    <EmptyState
      action={{ label: REPLY_TEMPLATE_MESSAGES.tryAgain, onPress: refresh }}
      body={REPLY_TEMPLATE_MESSAGES.tryAgainOffer}
      heading={REPLY_TEMPLATE_MESSAGES.couldntLoadArchived}
    />
  ) : (
    <EmptyState
      body={canWrite ? REPLY_TEMPLATE_MESSAGES.noArchivedBody : REPLY_TEMPLATE_MESSAGES.noArchivedBodyViewer}
      heading={REPLY_TEMPLATE_MESSAGES.noArchivedHeading}
    />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListHeaderComponent={
        rows.length > 0 ? (
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {showsBanner ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
              {canWrite ? REPLY_TEMPLATE_MESSAGES.archivedHeader : REPLY_TEMPLATE_MESSAGES.archivedHeaderViewer}
            </Text>
          </View>
        ) : undefined
      }
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(template) => template.id}
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <ReplyTemplateRow onPress={() => router.push(`/reply-templates/archived/${item.id}`)} template={item} />
      )}
      testID="archived-reply-templates-list"
    />
  );
}
