import { Pencil, Trash2 } from "lucide-react";
import RowActions from "@/components/RowActions";
import type { ScreeningAnswer } from "@myjobhunter/api-client/types/screening-answer/screening-answer";
import { screeningQuestionLabel } from "@myjobhunter/api-client/utils/screeningQuestionLabel";

interface ScreeningAnswerRowProps {
  answer: ScreeningAnswer;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ScreeningAnswerRow({ answer, onEdit, onDelete }: ScreeningAnswerRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 group rounded-md p-2 hover:bg-muted/40">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{screeningQuestionLabel(answer.question_key)}</p>
        <p className="text-sm truncate">
          {answer.answer ?? <em className="text-muted-foreground">No answer</em>}
        </p>
      </div>
      <RowActions
        actions={[
          { key: "edit", label: "Edit answer", icon: Pencil, onClick: onEdit },
          { key: "delete", label: "Delete answer", icon: Trash2, destructive: true, onClick: onDelete },
        ]}
      />
    </div>
  );
}
