/**
 * One question, start to finish: send it (the call that carries the human
 * check, plus the previous answer's ticket when the chat has history), and
 * while Claude asks for tools, run them here and send the results back with
 * the last reply's ticket. Ends when Claude answers in text, returning that
 * reply's ticket for the next question.
 *
 * Pure apart from `deps` (the relay call and the tool runner) and `events`, so
 * the whole loop is unit-tested with fakes. Errors (HTTP, abort) are thrown to
 * the caller, which rolls the conversation back to before the question.
 */
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { CHAT_BLOCK, CHAT_ROLE, CHAT_STOP } from "@/games/wow-forever/data/ask/askChatWire";
import type { AskTurnDeps } from "@/games/wow-forever/types/ask/askTurnDeps";
import type { AskTurnEvents } from "@/games/wow-forever/types/ask/askTurnEvents";
import type { AskTurnResult } from "@/games/wow-forever/types/ask/askTurnResult";
import type { ChatMessage } from "@/games/wow-forever/types/ask/chatMessage";
import type { ChatToolResultBlock } from "@/games/wow-forever/types/ask/chatToolResultBlock";
import type { ChatToolUseBlock } from "@/games/wow-forever/types/ask/chatToolUseBlock";
import type { ChatTurnResponse } from "@/games/wow-forever/types/ask/chatTurnResponse";

export function userQuestion(text: string): ChatMessage {
  return { role: CHAT_ROLE.user, content: [{ type: CHAT_BLOCK.text, text }] };
}

export function toolCallsOf(message: ChatMessage): ChatToolUseBlock[] {
  return message.content.filter((b): b is ChatToolUseBlock => b.type === CHAT_BLOCK.toolUse);
}

/**
 * The final reply keeps only its text: tool calls that won't be run (no rounds
 * left, cut off mid-call) are dropped — a tool call with no result after it would make the
 * next question an invalid conversation. An empty reply gets a line saying so.
 */
function withoutToolCalls(message: ChatMessage): ChatMessage {
  if (toolCallsOf(message).length === 0) return message;
  const content = message.content.filter((b) => b.type !== CHAT_BLOCK.toolUse);
  return { ...message, content: content.length ? content : [{ type: CHAT_BLOCK.text, text: ASK_COPY.unfinished }] };
}

function wantsTools(response: ChatTurnResponse): boolean {
  return response.stop_reason === CHAT_STOP.toolUse && response.rounds_left > 0 && toolCallsOf(response.message).length > 0;
}

async function runTools(calls: readonly ChatToolUseBlock[], deps: AskTurnDeps, events: AskTurnEvents): Promise<ChatMessage> {
  const outcomes = await Promise.all(calls.map((call) => deps.runTool(call)));
  const content: ChatToolResultBlock[] = calls.map((call, i) => {
    const outcome = outcomes[i];
    if (outcome.card !== null) events.onCard(call.id, outcome.card);
    return { type: CHAT_BLOCK.toolResult, tool_use_id: call.id, content: outcome.content, is_error: outcome.isError };
  });
  return { role: CHAT_ROLE.user, content };
}

export async function runAskTurn(
  history: readonly ChatMessage[],
  historyTicket: string | null,
  question: string,
  deps: AskTurnDeps,
  events: AskTurnEvents,
): Promise<AskTurnResult> {
  let messages: ChatMessage[] = [...history, userQuestion(question)];
  events.onMessages(messages);
  const first = history.length > 0 && historyTicket !== null ? { messages, ticket: historyTicket } : { messages };
  let response = await deps.send(first, true);
  while (wantsTools(response)) {
    const calls = toolCallsOf(response.message);
    messages = [...messages, response.message];
    events.onMessages(messages);
    events.onToolCalls(calls);
    messages = [...messages, await runTools(calls, deps, events)];
    events.onMessages(messages);
    response = await deps.send({ messages, ticket: response.ticket }, false);
  }
  const reply = withoutToolCalls(response.message);
  messages = [...messages, reply];
  events.onMessages(messages);
  return { messages, ticket: reply === response.message ? response.ticket : null };
}
