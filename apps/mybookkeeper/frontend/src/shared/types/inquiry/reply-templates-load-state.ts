import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";

/** The parts of a reply-templates list query a panel needs to pick what to show. */
export interface ReplyTemplatesLoadState {
  currentData?: readonly ReplyTemplate[];
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}
