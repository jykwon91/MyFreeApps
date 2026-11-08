import type { ChatContentBlock } from "@/games/wow-forever/types/ask/chatContentBlock";
import type { ChatRole } from "@/games/wow-forever/types/ask/chatRole";

/** One message of the conversation, as the relay sends and receives it. */
export interface ChatMessage {
  role: ChatRole;
  content: ChatContentBlock[];
}
