import {
  useCreateReplyTemplateMutation,
  useGetReplyTemplatesQuery,
  useUpdateReplyTemplateMutation,
} from "@mybookkeeper/api-client/store/inquiriesApi";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { useToast } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import { REPLY_TEMPLATE_AMBIGUOUS_CREATE as AMBIGUOUS_CREATE, REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";
import type { ReplyTemplateFailure } from "../../types/ReplyTemplateFailure";
import type { ReplyTemplateFormValues } from "../../types/ReplyTemplateFormValues";
import { changedFields } from "./replyTemplateFormValues";
import { saveFailure } from "./replyTemplateFailure";
import { leaveToList } from "./replyTemplateNavigation";

/** Creates a template, or saves what changed on `original`, and leaves when it's done. */
export function useSaveReplyTemplate(original: ReplyTemplate | null) {
  const { showToast } = useToast();
  const { currentData: templates, refetch } = useGetReplyTemplatesQuery();
  const [createTemplate] = useCreateReplyTemplateMutation();
  const [updateTemplate] = useUpdateReplyTemplateMutation();
  const [isBusy, setIsBusy] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [failure, setFailure] = useState<ReplyTemplateFailure | null>(null);
  // Stays locked after a save: the screen is still tappable while it slides away.
  const isSending = useRef(false);

  // Leaving waits a render, or the discard question still sees the unsaved changes.
  useEffect(() => {
    if (isLeaving) leaveToList();
  }, [isLeaving]);

  function finish(message: string, type?: "error"): void {
    showToast(message, type);
    setIsLeaving(true);
  }

  /** The server commits before it answers, so a lost answer, a proxy error or a "taken" can mean this one landed. */
  async function whatHappened(values: ReplyTemplateFormValues): Promise<"landed" | "missing" | "unknown"> {
    if (!templates) return "unknown";
    const latest = await refetch();
    if (!latest.isSuccess) return "unknown";
    const landed = latest.data.some(
      (template) =>
        template.name === values.name &&
        template.body_template === values.body &&
        !templates.some((known) => known.id === template.id),
    );
    return landed ? "landed" : "missing";
  }

  async function send(values: ReplyTemplateFormValues): Promise<void> {
    if (original) {
      await updateTemplate({ id: original.id, data: changedFields(values, original) }).unwrap();
      finish(REPLY_TEMPLATE_MESSAGES.changesSaved);
      return;
    }
    await createTemplate({ name: values.name, subject_template: values.subject, body_template: values.body }).unwrap();
    finish(REPLY_TEMPLATE_MESSAGES.templateSaved);
  }

  async function submit(values: ReplyTemplateFormValues): Promise<void> {
    if (isSending.current) return;
    if (original && Object.keys(changedFields(values, original)).length === 0) {
      setIsLeaving(true);
      return;
    }
    isSending.current = true;
    setIsBusy(true);
    setFailure(null);
    try {
      await send(values);
    } catch (error) {
      const reason = saveFailure(error);
      const outcome = !original && AMBIGUOUS_CREATE.has(reason) ? await whatHappened(values) : "missing";
      if (reason === "gone") {
        finish(REPLY_TEMPLATE_MESSAGES.goneAnymore, "error");
        // The list still has it.
        void refetch();
      } else if (outcome === "landed") {
        finish(REPLY_TEMPLATE_MESSAGES.templateSaved);
      } else {
        setFailure(outcome === "unknown" ? "unsure" : reason);
        isSending.current = false;
      }
    } finally {
      setIsBusy(false);
    }
  }

  return { templates, submit, isBusy, isLeaving, failure, clearFailure: () => setFailure(null) };
}
