/**
 * Runs one of Claude's tool calls against the site's own data. Every input is
 * checked against the tool's schema first; a bad input, a data file that won't
 * load or an oversized result comes back to Claude as an error result (and no
 * card), never as a thrown error that would stop the chat.
 */
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { findMacrosTool } from "@/games/wow-forever/lib/ask/tools/findMacrosTool";
import { findRaresTool } from "@/games/wow-forever/lib/ask/tools/findRaresTool";
import { goldFarmingTool } from "@/games/wow-forever/lib/ask/tools/goldFarmingTool";
import { dungeonInfoTool } from "@/games/wow-forever/lib/ask/tools/dungeonInfoTool";
import { findPlacesTool } from "@/games/wow-forever/lib/ask/tools/findPlacesTool";
import { professionGuideTool } from "@/games/wow-forever/lib/ask/tools/professionGuideTool";
import { playerContextTool } from "@/games/wow-forever/lib/ask/tools/playerContextTool";
import { searchItemsTool } from "@/games/wow-forever/lib/ask/tools/searchItemsTool";
import { searchNpcsTool } from "@/games/wow-forever/lib/ask/tools/searchNpcsTool";
import {
  checkGoldInput,
  checkItemSearchInput,
  checkMacrosInput,
  checkNoInput,
  checkNpcSearchInput,
  checkProfessionInput,
  checkQueryOnlyInput,
  checkRaresInput,
} from "@/games/wow-forever/lib/ask/validateAskToolInput";
import type { AskInputCheck } from "@/games/wow-forever/types/ask/askInputCheck";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";
import type { ChatToolUseBlock } from "@/games/wow-forever/types/ask/chatToolUseBlock";

export function toolError(message: string): AskToolOutcome {
  return { content: JSON.stringify({ error: message }), isError: true, card: null };
}

async function withInput<T>(
  check: AskInputCheck<T>,
  run: (value: T) => AskToolOutcome | Promise<AskToolOutcome>,
): Promise<AskToolOutcome> {
  return check.ok ? run(check.value) : toolError(`invalid input: ${check.error}`);
}

function dispatch(call: ChatToolUseBlock, data: AskToolData): Promise<AskToolOutcome> {
  switch (call.name) {
    case ASK_TOOL.searchNpcs:
      return withInput(checkNpcSearchInput(call.input), (input) => searchNpcsTool(input, data));
    case ASK_TOOL.findPlaces:
      return withInput(checkQueryOnlyInput(call.input), (input) => findPlacesTool(input, data));
    case ASK_TOOL.searchItems:
      return withInput(checkItemSearchInput(call.input), (input) => searchItemsTool(input, data));
    case ASK_TOOL.dungeonInfo:
      return withInput(checkQueryOnlyInput(call.input), (input) => dungeonInfoTool(input, data));
    case ASK_TOOL.playerContext:
      return withInput(checkNoInput(call.input), () => playerContextTool(data));
    case ASK_TOOL.findRares:
      return withInput(checkRaresInput(call.input), (input) => findRaresTool(input, data));
    case ASK_TOOL.professionGuide:
      return withInput(checkProfessionInput(call.input), (input) => professionGuideTool(input, data));
    case ASK_TOOL.goldFarming:
      return withInput(checkGoldInput(call.input), (input) => goldFarmingTool(input, data));
    case ASK_TOOL.findMacros:
      return withInput(checkMacrosInput(call.input), (input) => findMacrosTool(input));
    default:
      return Promise.resolve(toolError("unknown tool"));
  }
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export async function runAskTool(call: ChatToolUseBlock, data: AskToolData): Promise<AskToolOutcome> {
  let outcome: AskToolOutcome;
  try {
    outcome = await dispatch(call, data);
  } catch {
    return toolError("the site's data didn't load; try again");
  }
  if (byteLength(outcome.content) > ASK_LIMITS.toolResultMaxBytes) return toolError("result too large; ask for fewer results");
  return outcome;
}
