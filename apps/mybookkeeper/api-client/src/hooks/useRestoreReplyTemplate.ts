import { useGetArchivedReplyTemplatesQuery, useUpdateReplyTemplateMutation } from "../store/inquiriesApi";
import type { ReplyTemplateWriteOutcome } from "../types/inquiry/reply-template-write-outcome";
import { useSettledReplyTemplateWrite } from "./useSettledReplyTemplateWrite";

/** Restores an archived template, settling a lost answer by the archived list. */
export function useRestoreReplyTemplate(id: string, onDone: (outcome: ReplyTemplateWriteOutcome) => void) {
  const [updateTemplate] = useUpdateReplyTemplateMutation();
  const { refetch } = useGetArchivedReplyTemplatesQuery();
  const { run, isBusy } = useSettledReplyTemplateWrite(onDone);
  const restore = () =>
    run(id, { write: () => updateTemplate({ id, data: { is_archived: false } }).unwrap(), reloadList: refetch });
  return { restore, isBusy };
}
