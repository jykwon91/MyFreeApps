import type { CHAT_ROLE } from "@/games/wow-forever/data/ask/askChatWire";

export type ChatRole = (typeof CHAT_ROLE)[keyof typeof CHAT_ROLE];
