/**
 * The chat in sessionStorage, so a reload or a trip to the World Map and back
 * keeps it (and closing the tab forgets it). A stored value is re-checked
 * before use, and a question that was still being answered when the page went
 * away is dropped — its tool calls never got results, so it can't be continued.
 */
import { CHAT_BLOCK, CHAT_ROLE } from "@/games/wow-forever/data/ask/askChatWire";
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_STORAGE_KEY } from "@/games/wow-forever/data/ask/askLimits";
import { questionOf } from "@/games/wow-forever/lib/ask/askThread";
import type { AskCard } from "@/games/wow-forever/types/ask/askCard";
import type { AskStoredChat } from "@/games/wow-forever/types/ask/askStoredChat";
import type { ChatMessage } from "@/games/wow-forever/types/ask/chatMessage";

export const EMPTY_CHAT: AskStoredChat = { messages: [], cards: {}, ticket: null };

const ROLES: readonly unknown[] = Object.values(CHAT_ROLE);
const BLOCKS: readonly unknown[] = Object.values(CHAT_BLOCK);
const CARD_KINDS: readonly unknown[] = Object.values(ASK_CARD);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value) || !ROLES.includes(value.role) || !Array.isArray(value.content)) return false;
  return value.content.every((block) => isRecord(block) && BLOCKS.includes(block.type));
}

function isCard(value: unknown): value is AskCard {
  return isRecord(value) && CARD_KINDS.includes(value.kind);
}

/** Up to the last answered question: the conversation must end on Claude's text reply. */
export function completeTurnsOnly(messages: readonly ChatMessage[]): ChatMessage[] {
  const last = messages[messages.length - 1];
  const finished =
    last !== undefined && last.role === CHAT_ROLE.assistant && last.content.every((b) => b.type === CHAT_BLOCK.text);
  if (finished || messages.length === 0) return [...messages];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (questionOf(messages[i]) !== null) return messages.slice(0, i);
  }
  return [];
}

export function parseStoredChat(raw: unknown): AskStoredChat {
  if (!isRecord(raw) || !Array.isArray(raw.messages) || !raw.messages.every(isMessage) || !isRecord(raw.cards)) {
    return EMPTY_CHAT;
  }
  const cards: Record<string, AskCard> = {};
  for (const [id, card] of Object.entries(raw.cards)) {
    if (isCard(card)) cards[id] = card;
  }
  const messages = completeTurnsOnly(raw.messages);
  // The ticket is only ever replaced when a question finishes, so it still covers the answered turns kept here.
  const ticket = messages.length > 0 && typeof raw.ticket === "string" && raw.ticket !== "" ? raw.ticket : null;
  return { messages, cards, ticket };
}

export function readStoredChat(): AskStoredChat {
  try {
    const text = window.sessionStorage.getItem(ASK_STORAGE_KEY);
    return text === null ? EMPTY_CHAT : parseStoredChat(JSON.parse(text));
  } catch {
    return EMPTY_CHAT;
  }
}

export function writeStoredChat(chat: AskStoredChat): void {
  try {
    if (chat.messages.length === 0) window.sessionStorage.removeItem(ASK_STORAGE_KEY);
    else window.sessionStorage.setItem(ASK_STORAGE_KEY, JSON.stringify(chat));
  } catch {
    // Storage full or blocked: the chat still works, it just won't survive a reload.
  }
}
