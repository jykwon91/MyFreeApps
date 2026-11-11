import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X } from "lucide-react";
import { useCreateEducationMutation, useUpdateEducationMutation } from "@myjobhunter/api-client/store/educationApi";
import type { Education } from "@myjobhunter/api-client/types/education/education";
import type { EducationFormValues as FormValues } from "@myjobhunter/api-client/types/education/education-form-values";
import { educationFormProblems } from "@myjobhunter/api-client/utils/educationFormProblems";
import { educationFormValues } from "@myjobhunter/api-client/utils/educationFormValues";
import { educationRequest } from "@myjobhunter/api-client/utils/educationRequest";
import { problemsResolver } from "@/lib/problems-resolver";

const resolver = problemsResolver(educationFormProblems);

export interface EducationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: Education;
}

export default function EducationDialog({ open, onOpenChange, existing }: EducationDialogProps) {
  const [createEducation, { isLoading: isCreating }] = useCreateEducationMutation();
  const [updateEducation, { isLoading: isUpdating }] = useUpdateEducationMutation();
  const isLoading = isCreating || isUpdating;
  const isEdit = Boolean(existing);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    defaultValues: educationFormValues(),
    resolver,
  });

  useEffect(() => {
    if (open) {
      reset(educationFormValues(existing));
    }
  }, [open, existing, reset]);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    const body = educationRequest(values);
    try {
      if (isEdit && existing) {
        await updateEducation({ id: existing.id, patch: body }).unwrap();
        showSuccess("Education updated");
      } else {
        await createEducation(body).unwrap();
        showSuccess("Education added");
      }
      onOpenChange(false);
    } catch (err) {
      showError(
        isEdit
          ? `Couldn't update education: ${extractErrorMessage(err)}`
          : `Couldn't add education: ${extractErrorMessage(err)}`,
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
              {isEdit ? "Edit education" : "Add education"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label htmlFor="ed-school" className="block text-sm font-medium mb-1">
                School <span className="text-destructive">*</span>
              </label>
              <input
                id="ed-school"
                type="text"
                {...register("school")}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                placeholder="e.g. State University"
                autoFocus
              />
              {errors.school ? (
                <p className="text-xs text-destructive mt-1">{errors.school.message}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ed-degree" className="block text-sm font-medium mb-1">Degree</label>
                <input
                  id="ed-degree"
                  type="text"
                  {...register("degree")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="e.g. B.S."
                />
                {errors.degree ? (
                  <p className="text-xs text-destructive mt-1">{errors.degree.message}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="ed-field" className="block text-sm font-medium mb-1">Field</label>
                <input
                  id="ed-field"
                  type="text"
                  {...register("field")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="e.g. Computer Science"
                />
                {errors.field ? (
                  <p className="text-xs text-destructive mt-1">{errors.field.message}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="ed-start-year" className="block text-sm font-medium mb-1">Start year</label>
                <input
                  id="ed-start-year"
                  type="number"
                  {...register("start_year")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="2018"
                />
                {errors.start_year ? (
                  <p className="text-xs text-destructive mt-1">{errors.start_year.message}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="ed-end-year" className="block text-sm font-medium mb-1">End year</label>
                <input
                  id="ed-end-year"
                  type="number"
                  {...register("end_year")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="2022"
                />
                {errors.end_year ? (
                  <p className="text-xs text-destructive mt-1">{errors.end_year.message}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="ed-gpa" className="block text-sm font-medium mb-1">GPA</label>
                <input
                  id="ed-gpa"
                  type="number"
                  step="0.01"
                  {...register("gpa")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="3.80"
                />
                {errors.gpa ? (
                  <p className="text-xs text-destructive mt-1">{errors.gpa.message}</p>
                ) : null}
              </div>
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
                {isEdit ? "Save changes" : "Add education"}
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
