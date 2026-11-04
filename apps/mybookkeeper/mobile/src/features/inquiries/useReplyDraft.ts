import { useState } from "react";
import type { ReplyDraft } from "../../types/ReplyDraft";
import { loadReplyDraft, saveReplyDraft } from "./replyDrafts";

const EMPTY_DRAFT: ReplyDraft = { subject: "", body: "", templateId: null };

/** Saved at every change: a small file, and nothing to lose when the app is killed or the screen goes. */
export function useReplyDraft(inquiryId: string) {
  const [initial] = useState(() => loadReplyDraft(inquiryId));
  const [draft, setDraft] = useState<ReplyDraft>(initial ?? EMPTY_DRAFT);
  const [wasRestored, setWasRestored] = useState(initial !== null);

  function change(next: ReplyDraft): void {
    setDraft(next);
    saveReplyDraft(inquiryId, next);
  }

  return {
    draft,
    change,
    wasRestored,
    startOver: () => {
      setWasRestored(false);
      change(EMPTY_DRAFT);
    },
    settleRestored: () => setWasRestored(false),
  };
}
