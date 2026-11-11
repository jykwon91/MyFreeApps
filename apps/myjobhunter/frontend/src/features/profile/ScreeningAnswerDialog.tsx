import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X } from "lucide-react";
import {
  useCreateScreeningAnswerMutation,
  useUpdateScreeningAnswerMutation,
} from "@myjobhunter/api-client/store/screeningAnswersApi";
import type { ScreeningAnswer } from "@myjobhunter/api-client/types/screening-answer/screening-answer";
import type { ScreeningAnswerFormValues as FormValues } from "@myjobhunter/api-client/types/screening-answer/screening-answer-form-values";
import { PROFILE_FORM_PROBLEMS } from "@myjobhunter/api-client/constants/profileFormProblems";
import { SCREENING_QUESTIONS } from "@myjobhunter/api-client/constants/screeningQuestions";
import { isConflict } from "@myjobhunter/api-client/utils/isConflict";
import { screeningAnswerFormProblems } from "@myjobhunter/api-client/utils/screeningAnswerFormProblems";
import { screeningQuestionLabel } from "@myjobhunter/api-client/utils/screeningQuestionLabel";
import { unansweredScreeningQuestions } from "@myjobhunter/api-client/utils/unansweredScreeningQuestions";
import { problemsResolver } from "@/lib/problems-resolver";

const resolver = problemsResolver(screeningAnswerFormProblems);
const QUESTION_PROBLEM_ID = "sa-question-key-problem";
const ANSWER_PROBLEM_ID = "sa-answer-problem";

export interface ScreeningAnswerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: ScreeningAnswer;
  /** Existing keys already answered — excluded from the "add" dropdown. */
  existingKeys?: string[];
}

export default function ScreeningAnswerDialog({
  open,
  onOpenChange,
  existing,
  existingKeys = [],
}: ScreeningAnswerDialogProps) {
  const [createAnswer, { isLoading: isCreating }] = useCreateScreeningAnswerMutation();
  const [updateAnswer, { isLoading: isUpdating }] = useUpdateScreeningAnswerMutation();
  const isLoading = isCreating || isUpdating;
  const isEdit = Boolean(existing);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      question_key: "",
      answer: "",
    },
    resolver,
  });

  useEffect(() => {
    if (open) {
      reset({
        question_key: existing?.question_key ?? "",
        answer: existing?.answer ?? "",
      });
    }
  }, [open, existing, reset]);

  const availableKeys = isEdit ? SCREENING_QUESTIONS : unansweredScreeningQuestions(existingKeys);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    try {
      if (isEdit && existing) {
        await updateAnswer({
          id: existing.id,
          patch: { answer: values.answer.trim() || null },
        }).unwrap();
        showSuccess("Answer updated");
      } else {
        await createAnswer({
          question_key: values.question_key,
          answer: values.answer.trim() || null,
        }).unwrap();
        showSuccess("Screening answer added");
      }
      onOpenChange(false);
    } catch (err) {
      if (isEdit) {
        showError(`Couldn't update answer: ${extractErrorMessage(err)}`);
      } else if (isConflict(err)) {
        // Answered meanwhile (another tab, or a double click): say so by the question.
        setError("question_key", { type: "server", message: PROFILE_FORM_PROBLEMS.screeningAlreadyAnswered });
      } else {
        showError(`Couldn't add answer: ${extractErrorMessage(err)}`);
      }
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md max-h-[90vh] overflow-y-auto bg-card border rounded-lg shadow-lg z-50 p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">
              {isEdit ? "Edit answer" : "Add screening answer"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {isEdit ? (
              <div>
                <label className="block text-sm font-medium mb-1">Question</label>
                <p className="text-sm text-muted-foreground">
                  {existing ? screeningQuestionLabel(existing.question_key) : null}
                  {existing?.is_eeoc ? (
                    <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                      EEOC
                    </span>
                  ) : null}
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="sa-question-key" className="block text-sm font-medium mb-1">
                  Question <span className="text-destructive">*</span>
                </label>
                <select
                  id="sa-question-key"
                  {...register("question_key")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  aria-invalid={errors.question_key ? true : undefined}
                  aria-describedby={errors.question_key ? QUESTION_PROBLEM_ID : undefined}
                >
                  <option value="">Select a question...</option>
                  {availableKeys.map((q) => (
                    <option key={q.key} value={q.key}>
                      {q.label}
                      {q.eeoc ? " (EEOC)" : ""}
                    </option>
                  ))}
                </select>
                {errors.question_key ? (
                  <p id={QUESTION_PROBLEM_ID} role="alert" className="text-xs text-destructive mt-1">
                    {errors.question_key.message}
                  </p>
                ) : null}
              </div>
            )}

            <div>
              <label htmlFor="sa-answer" className="block text-sm font-medium mb-1">Your answer</label>
              <textarea
                id="sa-answer"
                {...register("answer")}
                rows={3}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none"
                placeholder="Enter your pre-filled answer..."
                autoFocus={isEdit}
                aria-invalid={errors.answer ? true : undefined}
                aria-describedby={errors.answer ? ANSWER_PROBLEM_ID : undefined}
              />
              {errors.answer ? (
                <p id={ANSWER_PROBLEM_ID} role="alert" className="text-xs text-destructive mt-1">
                  {errors.answer.message}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button type="button" className="px-4 py-2 text-sm border rounded-md hover:bg-muted">
                  Cancel
                </button>
              </Dialog.Close>
              <LoadingButton
                type="submit"
                isLoading={isLoading}
                loadingText={isEdit ? "Saving..." : "Adding..."}
              >
                {isEdit ? "Save changes" : "Add answer"}
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
