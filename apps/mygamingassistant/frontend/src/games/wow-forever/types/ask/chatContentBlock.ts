import type { ChatTextBlock } from "@/games/wow-forever/types/ask/chatTextBlock";
import type { ChatToolResultBlock } from "@/games/wow-forever/types/ask/chatToolResultBlock";
import type { ChatToolUseBlock } from "@/games/wow-forever/types/ask/chatToolUseBlock";

/** The only block kinds the chat relay accepts or returns. */
export type ChatContentBlock = ChatTextBlock | ChatToolUseBlock | ChatToolResultBlock;
