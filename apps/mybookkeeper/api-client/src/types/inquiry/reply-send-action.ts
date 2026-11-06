import type { REPLY_SEND_ACTION } from "../../constants/replySendAction";

export type ReplySendAction = (typeof REPLY_SEND_ACTION)[keyof typeof REPLY_SEND_ACTION];
