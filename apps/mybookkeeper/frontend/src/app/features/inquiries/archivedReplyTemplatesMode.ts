import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import type { ArchivedReplyTemplatesMode } from "@/shared/types/inquiry/archived-reply-templates-mode";

interface ModeInputs {
  templates: readonly ReplyTemplate[] | undefined;
  isError: boolean;
  isFetching: boolean;
}

/** A failed load never reads as "none": only a list that loaded can be empty. */
export function archivedReplyTemplatesMode({ templates, isError, isFetching }: ModeInputs): ArchivedReplyTemplatesMode {
  if (!templates) return isError && !isFetching ? "error" : "loading";
  // An empty list that then failed to reload can't say there are none any more.
  if (isError) return templates.length > 0 ? "stale" : "error";
  return templates.length === 0 ? "empty" : "list";
}
