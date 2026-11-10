import { useGetArchivedReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { Banner, EmptyState, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import { useCanWrite } from "../workspace/useCanWrite";
import ReplyTemplateBody from "./ReplyTemplateBody";
import ReplyTemplateDetailSkeleton from "./ReplyTemplateDetailSkeleton";
import { replyTemplatePageState } from "./replyTemplatePageState";
import { leaveToArchived } from "./replyTemplateNavigation";
import RestoreReplyTemplateButton from "./RestoreReplyTemplateButton";

export default function ArchivedReplyTemplateDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const [hasRestored, setHasRestored] = useState(false);
  // The API has no single-template read, so this finds it in the archived list.
  const { currentData, error, isFetching, refetch } = useGetArchivedReplyTemplatesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const template = currentData?.find((candidate) => candidate.id === id);

  const state = replyTemplatePageState({ template, list: currentData, error, isFetching, isLeaving: hasRestored });
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
        action={{ label: REPLY_TEMPLATE_MESSAGES.back, onPress: leaveToArchived }}
        body={REPLY_TEMPLATE_MESSAGES.maybeRestored}
        heading={REPLY_TEMPLATE_MESSAGES.cantFindArchived}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{REPLY_TEMPLATE_MESSAGES.archivedNote}</Text>
      <ReplyTemplateBody template={template} />
      {canWrite ? <RestoreReplyTemplateButton id={template.id} onRestored={() => setHasRestored(true)} /> : null}
    </ScrollView>
  );
}
