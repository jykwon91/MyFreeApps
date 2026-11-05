import { useGetReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import { useCanWrite } from "../workspace/useCanWrite";
import ReplyTemplateRow from "./ReplyTemplateRow";
import ReplyTemplatesSkeleton from "./ReplyTemplatesSkeleton";

export default function ReplyTemplatesScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const { currentData, error, isFetching, refetch } = useGetReplyTemplatesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const rows = currentData ?? [];
  const showsBanner = Boolean(error) && rows.length > 0;
  const makeOne = () => router.push("/reply-templates/new");

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
      action={canWrite ? { label: REPLY_TEMPLATE_MESSAGES.makeOne, onPress: makeOne } : undefined}
      body={canWrite ? REPLY_TEMPLATE_MESSAGES.noneBody : REPLY_TEMPLATE_MESSAGES.noneBodyViewer}
      heading={REPLY_TEMPLATE_MESSAGES.noneHeading}
    />
  );

  return (
    <FlatList
      ListEmptyComponent={emptyList}
      ListHeaderComponent={
        showsBanner || canWrite ? (
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {showsBanner ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            {canWrite ? (
              <LoadingButton onPress={makeOne} variant="secondary">
                {REPLY_TEMPLATE_MESSAGES.newTemplate}
              </LoadingButton>
            ) : null}
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
