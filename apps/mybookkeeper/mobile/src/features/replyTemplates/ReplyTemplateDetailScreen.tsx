import { useGetReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import { useCanWrite } from "../workspace/useCanWrite";
import ArchiveReplyTemplateButton from "./ArchiveReplyTemplateButton";
import ReplyTemplateBody from "./ReplyTemplateBody";
import ReplyTemplateDetailSkeleton from "./ReplyTemplateDetailSkeleton";
import { replyTemplatePageState } from "./replyTemplatePageState";

export default function ReplyTemplateDetailScreen({ id }: { id: string }) {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const [hasArchived, setHasArchived] = useState(false);
  // The API has no single-template read, so this finds it in the list.
  const { currentData, error, isFetching, refetch } = useGetReplyTemplatesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const template = currentData?.find((candidate) => candidate.id === id);

  const state = replyTemplatePageState({ template, list: currentData, error, isFetching, isLeaving: hasArchived });
  if (state === "loading") return <ReplyTemplateDetailSkeleton />;
  if (state === "couldntLoad") {
    return (
      <EmptyState
        action={{ label: REPLY_TEMPLATE_MESSAGES.tryAgain, onPress: refresh }}
        body={REPLY_TEMPLATE_MESSAGES.tryAgainOffer}
        heading={REPLY_TEMPLATE_MESSAGES.couldntLoadOne}
      />
    );
  }
  if (state === "missing" || !template) {
    return (
      <EmptyState
        action={{ label: REPLY_TEMPLATE_MESSAGES.back, onPress: () => router.back() }}
        body={REPLY_TEMPLATE_MESSAGES.maybeArchived}
        heading={REPLY_TEMPLATE_MESSAGES.cantFind}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <ReplyTemplateBody template={template} />
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          <LoadingButton onPress={() => router.push(`/reply-templates/${template.id}/edit`)} variant="secondary">
            {REPLY_TEMPLATE_MESSAGES.edit}
          </LoadingButton>
          <ArchiveReplyTemplateButton id={template.id} name={template.name} onArchived={() => setHasArchived(true)} />
        </View>
      ) : null}
    </ScrollView>
  );
}
