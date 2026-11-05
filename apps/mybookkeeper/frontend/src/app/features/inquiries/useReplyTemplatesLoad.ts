import { useState, type RefObject } from "react";
import type { ReplyTemplatesLoad } from "@/shared/types/inquiry/reply-templates-load";
import type { ReplyTemplatesLoadState } from "@/shared/types/inquiry/reply-templates-load-state";
import { replyTemplatesLoadMode } from "./replyTemplatesLoadMode";

/**
 * What a reply-templates panel shows, and its Try again. While a retry the user
 * started is on its way, rows already on screen keep their banner, showing it's
 * trying. Afterwards focus comes to the panel if the retry took its button away.
 */
export function useReplyTemplatesLoad(
  { currentData, isError, isFetching, refetch }: ReplyTemplatesLoadState,
  panel: RefObject<HTMLElement | null>,
): ReplyTemplatesLoad {
  const [isRetrying, setIsRetrying] = useState(false);
  const settled = replyTemplatesLoadMode({ templates: currentData, isError, isFetching });
  const keepsRows = isRetrying && (currentData?.length ?? 0) > 0;

  async function retry() {
    setIsRetrying(true);
    await refetch();
    setIsRetrying(false);
    const focusLost = !document.activeElement || document.activeElement === document.body;
    if (focusLost) panel.current?.focus({ preventScroll: true });
  }

  return { mode: keepsRows ? "stale" : settled, retry, isRetrying };
}
