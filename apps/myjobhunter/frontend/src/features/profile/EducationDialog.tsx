import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X } from "lucide-react";
import { useCreateEducationMutation, useUpdateEducationMutation } from "@/lib/educationApi";
import type { Education } from "@/types/education/education";

interface FormValues {
  school: string;
  degree: string;
  field: string;
  start_year: string;
  end_year: string;
  gpa: string;
}

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
    defaultValues: {
      school: "",
      degree: "",
      field: "",
      start_year: "",
      end_year: "",
      gpa: "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        school: existing?.school ?? "",
        degree: existing?.degree ?? "",
        field: existing?.field ?? "",
        start_year: existing?.start_year?.toString() ?? "",
        end_year: existing?.end_year?.toString() ?? "",
        gpa: existing?.gpa ?? "",
      });
    }
  }, [open, existing, reset]);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    const start_year = values.start_year ? parseInt(values.start_year, 10) : null;
    const end_year = values.end_year ? parseInt(values.end_year, 10) : null;
    const gpa = values.gpa.trim() || null;

    try {
      if (isEdit && existing) {
        await updateEducation({
          id: existing.id,
          patch: {
            school: values.school.trim(),
            degree: values.degree.trim() || null,
            field: values.field.trim() || null,
            start_year,
            end_year,
            gpa,
          },
        }).unwrap();
        showSuccess("Education updated");
      } else {
        await createEducation({
          school: values.school.trim(),
          degree: values.degree.trim() || null,
          field: values.field.trim() || null,
          start_year,
          end_year,
          gpa,
        }).unwrap();
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
              <label className="block text-sm font-medium mb-1">
                School <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                {...register("school", { required: "School is required" })}
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
                <label className="block text-sm font-medium mb-1">Degree</label>
                <input
                  type="text"
                  {...register("degree")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="e.g. B.S."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Field</label>
                <input
                  type="text"
                  {...register("field")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="e.g. Computer Science"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Start year</label>
                <input
                  type="number"
                  {...register("start_year", {
                    min: { value: 1950, message: "Min 1950" },
                    max: { value: 2100, message: "Max 2100" },
                  })}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="2018"
                />
                {errors.start_year ? (
                  <p className="text-xs text-destructive mt-1">{errors.start_year.message}</p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End year</label>
                <input
                  type="number"
                  {...register("end_year", {
                    min: { value: 1950, message: "Min 1950" },
                    max: { value: 2100, message: "Max 2100" },
                  })}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="2022"
                />
                {errors.end_year ? (
                  <p className="text-xs text-destructive mt-1">{errors.end_year.message}</p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">GPA</label>
                <input
                  type="number"
                  step="0.01"
                  {...register("gpa")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="3.80"
                />
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
