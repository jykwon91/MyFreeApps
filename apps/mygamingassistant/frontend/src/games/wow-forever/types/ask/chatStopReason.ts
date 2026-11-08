import type { CHAT_STOP } from "@/games/wow-forever/data/ask/askChatWire";

export type ChatStopReason = (typeof CHAT_STOP)[keyof typeof CHAT_STOP];
