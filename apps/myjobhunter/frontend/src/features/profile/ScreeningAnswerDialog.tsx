import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X } from "lucide-react";
import {
  useCreateScreeningAnswerMutation,
  useUpdateScreeningAnswerMutation,
} from "@/lib/screeningAnswersApi";
import type { ScreeningAnswer } from "@/types/screening-answer/screening-answer";

const ALLOWED_QUESTION_KEYS = [
  // Non-EEOC
  { key: "work_auth_us", label: "Work authorization (US)", eeoc: false },
  { key: "require_sponsorship", label: "Requires visa sponsorship", eeoc: false },
  { key: "willing_to_relocate", label: "Willing to relocate", eeoc: false },
  { key: "salary_expectation", label: "Salary expectation", eeoc: false },
  { key: "notice_period", label: "Notice period", eeoc: false },
  { key: "years_experience", label: "Total years of experience", eeoc: false },
  { key: "highest_education", label: "Highest education level", eeoc: false },
  { key: "linkedin_url", label: "LinkedIn URL", eeoc: false },
  { key: "github_url", label: "GitHub URL", eeoc: false },
  { key: "portfolio_url", label: "Portfolio URL", eeoc: false },
  { key: "available_start_date", label: "Available start date", eeoc: false },
  { key: "cover_letter", label: "Cover letter", eeoc: false },
  { key: "referral_source", label: "Referral source", eeoc: false },
  { key: "willing_to_travel", label: "Willing to travel", eeoc: false },
  { key: "has_drivers_license", label: "Has driver's license", eeoc: false },
  { key: "felony_conviction", label: "Felony conviction", eeoc: false },
  { key: "non_compete_agreement", label: "Non-compete agreement", eeoc: false },
  // EEOC
  { key: "eeoc_gender", label: "Gender (EEOC)", eeoc: true },
  { key: "eeoc_race_ethnicity", label: "Race / ethnicity (EEOC)", eeoc: true },
  { key: "eeoc_veteran_status", label: "Veteran status (EEOC)", eeoc: true },
  { key: "eeoc_disability_status", label: "Disability status (EEOC)", eeoc: true },
  { key: "eeoc_protected_class", label: "Protected class (EEOC)", eeoc: true },
];

interface FormValues {
  question_key: string;
  answer: string;
}

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

  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: {
      question_key: "",
      answer: "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        question_key: existing?.question_key ?? "",
        answer: existing?.answer ?? "",
      });
    }
  }, [open, existing, reset]);

  const availableKeys = isEdit
    ? ALLOWED_QUESTION_KEYS
    : ALLOWED_QUESTION_KEYS.filter((q) => !existingKeys.includes(q.key));

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
      showError(
        isEdit
          ? `Couldn't update answer: ${extractErrorMessage(err)}`
          : `Couldn't add answer: ${extractErrorMessage(err)}`,
      );
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
                  {ALLOWED_QUESTION_KEYS.find((q) => q.key === existing?.question_key)?.label ??
                    existing?.question_key}
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
                  {...register("question_key", { required: "Question is required" })}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                >
                  <option value="">Select a question...</option>
                  {availableKeys.map((q) => (
                    <option key={q.key} value={q.key}>
                      {q.label}
                      {q.eeoc ? " (EEOC)" : ""}
                    </option>
                  ))}
                </select>
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
              />
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
