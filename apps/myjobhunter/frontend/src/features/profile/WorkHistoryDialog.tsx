import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X } from "lucide-react";
import {
  useCreateWorkHistoryMutation,
  useUpdateWorkHistoryMutation,
} from "@myjobhunter/api-client/store/workHistoryApi";
import type { WorkHistory } from "@myjobhunter/api-client/types/work-history/work-history";
import type { WorkHistoryFormValues as FormValues } from "@myjobhunter/api-client/types/work-history/work-history-form-values";
import { workHistoryFormProblems } from "@myjobhunter/api-client/utils/workHistoryFormProblems";
import { workHistoryFormValues } from "@myjobhunter/api-client/utils/workHistoryFormValues";
import { workHistoryRequest } from "@myjobhunter/api-client/utils/workHistoryRequest";
import { problemsResolver } from "@/lib/problems-resolver";

const resolver = problemsResolver(workHistoryFormProblems);

export interface WorkHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, dialog is in edit mode; otherwise add mode. */
  existing?: WorkHistory;
}

export default function WorkHistoryDialog({ open, onOpenChange, existing }: WorkHistoryDialogProps) {
  const [createWorkHistory, { isLoading: isCreating }] = useCreateWorkHistoryMutation();
  const [updateWorkHistory, { isLoading: isUpdating }] = useUpdateWorkHistoryMutation();
  const isLoading = isCreating || isUpdating;
  const isEdit = Boolean(existing);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormValues>({
    defaultValues: workHistoryFormValues(),
    resolver,
  });

  const isCurrent = watch("is_current");

  useEffect(() => {
    if (open) {
      reset(workHistoryFormValues(existing));
    }
  }, [open, existing, reset]);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    const body = workHistoryRequest(values);
    try {
      if (isEdit && existing) {
        await updateWorkHistory({ id: existing.id, patch: body }).unwrap();
        showSuccess("Work history updated");
      } else {
        await createWorkHistory(body).unwrap();
        showSuccess("Work history added");
      }
      onOpenChange(false);
    } catch (err) {
      showError(
        isEdit
          ? `Couldn't update work history: ${extractErrorMessage(err)}`
          : `Couldn't add work history: ${extractErrorMessage(err)}`,
      );
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border rounded-lg shadow-lg z-50 p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">
              {isEdit ? "Edit work history" : "Add work history"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="wh-company" className="block text-sm font-medium mb-1">
                  Company <span className="text-destructive">*</span>
                </label>
                <input
                  id="wh-company"
                  type="text"
                  {...register("company_name")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="e.g. Acme Corp"
                  autoFocus
                />
                {errors.company_name ? (
                  <p className="text-xs text-destructive mt-1">{errors.company_name.message}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="wh-title" className="block text-sm font-medium mb-1">
                  Title <span className="text-destructive">*</span>
                </label>
                <input
                  id="wh-title"
                  type="text"
                  {...register("title")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="e.g. Senior Engineer"
                />
                {errors.title ? (
                  <p className="text-xs text-destructive mt-1">{errors.title.message}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="wh-start-date" className="block text-sm font-medium mb-1">
                  Start date <span className="text-destructive">*</span>
                </label>
                <input
                  id="wh-start-date"
                  type="date"
                  {...register("start_date")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                />
                {errors.start_date ? (
                  <p className="text-xs text-destructive mt-1">{errors.start_date.message}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="wh-end-date" className="block text-sm font-medium mb-1">End date</label>
                <input
                  id="wh-end-date"
                  type="date"
                  disabled={isCurrent}
                  {...register("end_date")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {errors.end_date ? (
                  <p className="text-xs text-destructive mt-1">{errors.end_date.message}</p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="wh-is-current"
                type="checkbox"
                {...register("is_current", {
                  onChange: (e) => {
                    if (e.target.checked) {
                      setValue("end_date", "");
                    }
                  },
                })}
                className="h-4 w-4 rounded border"
              />
              <label htmlFor="wh-is-current" className="text-sm">
                I currently work in this role
              </label>
            </div>

            <div>
              <label htmlFor="wh-bullets" className="block text-sm font-medium mb-1">Bullets</label>
              <textarea
                id="wh-bullets"
                {...register("bullets")}
                rows={5}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none"
                placeholder={"One bullet per line, e.g.:\nLed microservices migration\nReduced p99 latency by 40%"}
              />
              {errors.bullets ? (
                <p className="text-xs text-destructive mt-1">{errors.bullets.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">One achievement per line</p>
              )}
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
                {isEdit ? "Save changes" : "Add work history"}
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
