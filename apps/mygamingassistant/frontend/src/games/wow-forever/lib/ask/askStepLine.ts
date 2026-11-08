import { ASK_COPY, ASK_STEP } from "@/games/wow-forever/data/ask/askCopy";
import type { ChatToolUseBlock } from "@/games/wow-forever/types/ask/chatToolUseBlock";

/** The line shown while a tool call runs ("Searching the map for “warlock trainer”…"). */
export function stepLine(call: ChatToolUseBlock): string {
  const query = typeof call.input.query === "string" ? call.input.query : "";
  const step = Object.prototype.hasOwnProperty.call(ASK_STEP, call.name) ? ASK_STEP[call.name] : null;
  return step === null ? ASK_COPY.thinking : step(query);
}
