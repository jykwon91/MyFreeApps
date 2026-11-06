import type { REPLY_TAB } from "@/shared/lib/reply-tab";

export type ReplyTab = (typeof REPLY_TAB)[keyof typeof REPLY_TAB];
