import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X } from "lucide-react";
import {
  useCreateWorkHistoryMutation,
  useUpdateWorkHistoryMutation,
} from "@/lib/workHistoryApi";
import type { WorkHistory } from "@/types/work-history/work-history";

interface FormValues {
  company_name: string;
  title: string;
  start_date: string;
  end_date: string;
  bullets: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, dialog is in edit mode; otherwise add mode. */
  existing?: WorkHistory;
}

function bulletsToText(bullets: string[]): string {
  return bullets.join("\n");
}

function textToBullets(text: string): string[] {
  return text
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean);
}

export default function WorkHistoryDialog({ open, onOpenChange, existing }: Props) {
  const [createWorkHistory, { isLoading: isCreating }] = useCreateWorkHistoryMutation();
  const [updateWorkHistory, { isLoading: isUpdating }] = useUpdateWorkHistoryMutation();
  const isLoading = isCreating || isUpdating;
  const isEdit = Boolean(existing);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    defaultValues: {
      company_name: "",
      title: "",
      start_date: "",
      end_date: "",
      bullets: "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        company_name: existing?.company_name ?? "",
        title: existing?.title ?? "",
        start_date: existing?.start_date ?? "",
        end_date: existing?.end_date ?? "",
        bullets: existing ? bulletsToText(existing.bullets) : "",
      });
    }
  }, [open, existing, reset]);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    const bullets = textToBullets(values.bullets);
    try {
      if (isEdit && existing) {
        await updateWorkHistory({
          id: existing.id,
          patch: {
            company_name: values.company_name.trim(),
            title: values.title.trim(),
            start_date: values.start_date || null,
            end_date: values.end_date.trim() || null,
            bullets,
          },
        }).unwrap();
        showSuccess("Work history updated");
      } else {
        await createWorkHistory({
          company_name: values.company_name.trim(),
          title: values.title.trim(),
          start_date: values.start_date,
          end_date: values.end_date.trim() || null,
          bullets,
        }).unwrap();
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
                  {...register("company_name", { required: "Company is required" })}
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
                  {...register("title", { required: "Title is required" })}
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
                  {...register("start_date", { required: "Start date is required" })}
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
                  {...register("end_date")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave blank if current role</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Bullets</label>
              <textarea
                {...register("bullets")}
                rows={5}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none"
                placeholder={"One bullet per line, e.g.:\nLed microservices migration\nReduced p99 latency by 40%"}
              />
              <p className="text-xs text-muted-foreground mt-1">One achievement per line</p>
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
