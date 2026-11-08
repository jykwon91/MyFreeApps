import type { ChatToolUseBlock } from "@/games/wow-forever/types/ask/chatToolUseBlock";
import type { ChatTurnRequest } from "@/games/wow-forever/types/ask/chatTurnRequest";
import type { ChatTurnResponse } from "@/games/wow-forever/types/ask/chatTurnResponse";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";

/** The turn loop's outside world — the relay call and the tool runner — so tests can play both. */
export interface AskTurnDeps {
  /** `isNewMessage` = the call that carries the human check. */
  send: (body: ChatTurnRequest, isNewMessage: boolean) => Promise<ChatTurnResponse>;
  runTool: (call: ChatToolUseBlock) => Promise<AskToolOutcome>;
}
