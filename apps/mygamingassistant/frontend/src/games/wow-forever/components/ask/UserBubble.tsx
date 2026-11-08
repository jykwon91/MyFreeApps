import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";

interface UserBubbleProps {
  question: string;
}

/** A question the player asked, as text only. */
export default function UserBubble({ question }: UserBubbleProps) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
        <span className="sr-only">{ASK_COPY.you}: </span>
        {question}
      </p>
    </div>
  );
}
