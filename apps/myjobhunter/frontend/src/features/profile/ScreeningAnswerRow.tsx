import { Pencil, Trash2 } from "lucide-react";
import type { ScreeningAnswer } from "@/types/screening-answer/screening-answer";

interface ScreeningAnswerRowProps {
  answer: ScreeningAnswer;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ScreeningAnswerRow({ answer, onEdit, onDelete }: ScreeningAnswerRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 group rounded-md p-2 hover:bg-muted/40">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground capitalize">
          {answer.question_key.replace(/_/g, " ")}
        </p>
        <p className="text-sm truncate">
          {answer.answer ?? <em className="text-muted-foreground">No answer</em>}
        </p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-2 rounded hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Edit answer"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded hover:bg-destructive/10 text-destructive min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Delete answer"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
