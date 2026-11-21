import { useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import ScreeningAnswerDialog from "@/features/profile/ScreeningAnswerDialog";
import ScreeningAnswerRow from "@/features/profile/ScreeningAnswerRow";
import { deleteWithFeedback } from "@/lib/delete-with-feedback";
import { unansweredScreeningQuestions } from "@myjobhunter/api-client/utils/unansweredScreeningQuestions";
import { useDeleteScreeningAnswerMutation } from "@myjobhunter/api-client/store/screeningAnswersApi";
import type { ScreeningAnswer } from "@myjobhunter/api-client/types/screening-answer/screening-answer";
import type { ScreeningAnswersSectionProps } from "@/types/profile/screening-answers-section-props";

export default function ScreeningAnswersSection({ answers }: ScreeningAnswersSectionProps) {
  const [deleteScreeningAnswer] = useDeleteScreeningAnswerMutation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ScreeningAnswer | undefined>();

  const existingKeys = answers.map((a) => a.question_key);
  const eeocAnswers = answers.filter((a) => a.is_eeoc);
  const nonEeocAnswers = answers.filter((a) => !a.is_eeoc);

  async function handleDelete(id: string) {
    if (!confirm("Remove this screening answer?")) return;
    await deleteWithFeedback(() => deleteScreeningAnswer(id).unwrap(), "Answer removed", "Couldn't remove answer");
  }

  function renderRows(group: ScreeningAnswer[]) {
    return group.map((answer) => (
      <ScreeningAnswerRow
        key={answer.id}
        answer={answer}
        onEdit={() => {
          setEditTarget(answer);
          setDialogOpen(true);
        }}
        onDelete={() => void handleDelete(answer.id)}
      />
    ));
  }

  return (
    <>
      <section className="border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-muted-foreground" />
            <h2 className="font-semibold">Screening answers</h2>
          </div>
          <button
            onClick={() => {
              setEditTarget(undefined);
              setDialogOpen(true);
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3"
            aria-label="Add screening answer"
            disabled={unansweredScreeningQuestions(existingKeys).length === 0}
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {answers.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No pre-filled answers yet — add common answers to speed up job applications
          </p>
        ) : (
          <div className="space-y-6">
            {nonEeocAnswers.length > 0 ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Standard questions
                </p>
                <div className="space-y-2">{renderRows(nonEeocAnswers)}</div>
              </div>
            ) : null}

            {eeocAnswers.length > 0 ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  EEOC questions
                </p>
                <div className="space-y-2">{renderRows(eeocAnswers)}</div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <ScreeningAnswerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existing={editTarget}
        existingKeys={existingKeys}
      />
    </>
  );
}
