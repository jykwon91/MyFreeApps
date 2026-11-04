import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { hasReplyDraft } from "./replyDrafts";

export function useHasReplyDraft(inquiryId: string): boolean {
  const [hasDraft, setHasDraft] = useState(() => hasReplyDraft(inquiryId));
  useFocusEffect(
    useCallback(() => {
      setHasDraft(hasReplyDraft(inquiryId));
    }, [inquiryId]),
  );
  return hasDraft;
}
