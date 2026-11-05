import { useRef, useState } from "react";
import { useGetArchivedReplyTemplatesQuery, useUpdateReplyTemplateMutation } from "../store/inquiriesApi";
import type { ReplyTemplateRestoreOutcome } from "../types/inquiry/reply-template-restore-outcome";
import { restoreReplyTemplate } from "../utils/restoreReplyTemplate";

/** Restores an archived template, ignoring repeat taps while one is in flight. */
export function useRestoreReplyTemplate(id: string, onDone: (outcome: ReplyTemplateRestoreOutcome) => void) {
  const [updateTemplate] = useUpdateReplyTemplateMutation();
  const { refetch } = useGetArchivedReplyTemplatesQuery();
  const [isBusy, setIsBusy] = useState(false);
  const busy = useRef(false);

  async function restore(): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setIsBusy(true);
    try {
      onDone(
        await restoreReplyTemplate(id, {
          restore: () => updateTemplate({ id, data: { is_archived: false } }).unwrap(),
          reloadArchived: refetch,
        }),
      );
    } finally {
      busy.current = false;
      setIsBusy(false);
    }
  }

  return { restore, isBusy };
}
