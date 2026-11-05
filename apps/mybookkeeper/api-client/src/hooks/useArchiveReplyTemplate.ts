import { useArchiveReplyTemplateMutation, useGetReplyTemplatesQuery } from "../store/inquiriesApi";
import type { ReplyTemplateWriteOutcome } from "../types/inquiry/reply-template-write-outcome";
import { useSettledReplyTemplateWrite } from "./useSettledReplyTemplateWrite";

/** Archives a template, settling a lost answer by the active list. `onDone` gets the id it was for. */
export function useArchiveReplyTemplate(onDone: (outcome: ReplyTemplateWriteOutcome, id: string) => void) {
  const [archiveTemplate] = useArchiveReplyTemplateMutation();
  const { refetch } = useGetReplyTemplatesQuery();
  const { run, isBusy } = useSettledReplyTemplateWrite(onDone);
  const archive = (id: string) => run(id, { write: () => archiveTemplate(id).unwrap(), reloadList: refetch });
  return { archive, isBusy };
}
