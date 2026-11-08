import { Button } from "@platform/ui";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";

interface NewChatBarProps {
  hasChat: boolean;
  canUndo: boolean;
  onNewChat: () => void;
  onUndo: () => void;
}

/** "New chat" over the thread; for a few seconds after, "Chat cleared. Undo". */
export default function NewChatBar({ hasChat, canUndo, onNewChat, onUndo }: NewChatBarProps) {
  if (canUndo) {
    return (
      <div role="status" className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
        {ASK_COPY.chatCleared}
        <Button variant="secondary" size="sm" onClick={onUndo}>
          {ASK_COPY.undo}
        </Button>
      </div>
    );
  }
  if (!hasChat) return null;
  return (
    <div className="flex justify-end">
      <Button variant="secondary" size="sm" onClick={onNewChat}>
        {ASK_COPY.newChat}
      </Button>
    </div>
  );
}
