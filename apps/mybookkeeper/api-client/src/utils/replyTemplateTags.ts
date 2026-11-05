import type { ReplyTemplate } from "../types/inquiry/reply-template";

/** Each template's own tag plus the list's, so any write refreshes every list that shows templates. */
export function replyTemplateTags(result: ReplyTemplate[] | undefined) {
  return result
    ? [
        ...result.map((t) => ({ type: "ReplyTemplate" as const, id: t.id })),
        { type: "ReplyTemplate" as const, id: "LIST" },
      ]
    : [{ type: "ReplyTemplate" as const, id: "LIST" }];
}
