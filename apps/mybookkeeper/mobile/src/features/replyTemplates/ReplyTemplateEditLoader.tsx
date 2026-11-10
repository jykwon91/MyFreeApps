import { useGetReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { EmptyState } from "@platform/mobile";
import { router } from "expo-router";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import ReplyTemplateForm from "./ReplyTemplateForm";
import ReplyTemplateFormSkeleton from "./ReplyTemplateFormSkeleton";

export default function ReplyTemplateEditLoader({ id }: { id: string }) {
  // The API has no single-template read, so this finds it in the list.
  const { currentData, error, isFetching, refetch } = useGetReplyTemplatesQuery();
  const template = currentData?.find((candidate) => candidate.id === id);

  if (template) return <ReplyTemplateForm key={template.id} original={template} />;
  if (!currentData && (isFetching || !error)) return <ReplyTemplateFormSkeleton />;
  if (!currentData) {
    return (
      <EmptyState
        action={{ label: REPLY_TEMPLATE_MESSAGES.tryAgain, onPress: () => void refetch() }}
        body={REPLY_TEMPLATE_MESSAGES.tryAgainOffer}
        heading={REPLY_TEMPLATE_MESSAGES.couldntLoadOne}
      />
    );
  }
  return (
    <EmptyState
      action={{ label: REPLY_TEMPLATE_MESSAGES.back, onPress: () => router.back() }}
      body={REPLY_TEMPLATE_MESSAGES.maybeArchived}
      heading={REPLY_TEMPLATE_MESSAGES.cantFind}
    />
  );
}
