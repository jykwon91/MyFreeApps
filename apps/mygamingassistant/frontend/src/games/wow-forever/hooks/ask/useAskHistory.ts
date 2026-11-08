import { useEffect, useState } from "react";
import { readStoredChat, writeStoredChat } from "@/games/wow-forever/lib/ask/askStorage";
import type { AskStoredChat } from "@/games/wow-forever/types/ask/askStoredChat";

/**
 * The chat, read once from sessionStorage and written back whenever it
 * changes. A question still being answered is written too; reading drops it
 * (see `askStorage`), so a reload mid-answer just loses that question.
 */
export function useAskHistory(): [AskStoredChat, (next: AskStoredChat) => void] {
  const [chat, setChat] = useState<AskStoredChat>(readStoredChat);
  useEffect(() => {
    writeStoredChat(chat);
  }, [chat]);
  return [chat, setChat];
}
