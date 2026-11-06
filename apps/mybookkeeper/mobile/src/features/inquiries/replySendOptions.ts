import type { UseReplySendOptions } from "@mybookkeeper/api-client/types/inquiry/use-reply-send-options";
import { randomUUID } from "expo-crypto";
import { replyRequestIds } from "./replyRequestIds";

export const REPLY_SEND_OPTIONS: UseReplySendOptions = { newRequestId: randomUUID, requestIds: replyRequestIds };
