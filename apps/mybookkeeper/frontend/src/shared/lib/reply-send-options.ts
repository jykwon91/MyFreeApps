import type { UseReplySendOptions } from "@mybookkeeper/api-client/types/inquiry/use-reply-send-options";
import { newRequestId } from "./new-request-id";
import { replyRequestIdStore } from "./reply-request-id-store";

export const REPLY_SEND_OPTIONS: UseReplySendOptions = { newRequestId, requestIds: replyRequestIdStore };
