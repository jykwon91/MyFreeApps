import type { AskToolName } from "@/games/wow-forever/types/ask/askToolName";

/** Claude asks the page to run one of its tools (in a `POST /api/wow/chat/turn` reply). */
export interface ChatToolUseBlock {
  type: "tool_use";
  id: string;
  name: AskToolName;
  input: Record<string, unknown>;
}
