import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import type { ReplyTemplatePageState } from "../../types/ReplyTemplatePageState";

interface PageInputs {
  template: ReplyTemplate | undefined;
  list: ReplyTemplate[] | undefined;
  error: unknown;
  isFetching: boolean;
  /** Set once an archive or restore succeeds, so the page doesn't flash "can't find" as the template leaves the list. */
  isLeaving: boolean;
}

/** Only a list that loaded can say a template isn't there; a failed reload can't. */
export function replyTemplatePageState({ template, list, error, isFetching, isLeaving }: PageInputs): ReplyTemplatePageState {
  if (isLeaving) return "loading";
  if (template) return "ready";
  if (isFetching || (!list && !error)) return "loading";
  if (!list || error) return "couldntLoad";
  return "missing";
}
