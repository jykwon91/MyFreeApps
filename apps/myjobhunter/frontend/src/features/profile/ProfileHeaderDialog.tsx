import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X } from "lucide-react";
import { useUpdateProfileMutation } from "@/lib/profileApi";
import type { Profile } from "@/types/profile/profile";

interface FormValues {
  summary: string;
  seniority: string;
}

const SENIORITY_OPTIONS = [
  { value: "", label: "— not set —" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff" },
  { value: "principal", label: "Principal" },
  { value: "manager", label: "Manager" },
  { value: "director", label: "Director" },
  { value: "exec", label: "Executive" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
}

export default function ProfileHeaderDialog({ open, onOpenChange, profile }: Props) {
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();

  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: {
      summary: profile.summary ?? "",
      seniority: profile.seniority ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        summary: profile.summary ?? "",
        seniority: profile.seniority ?? "",
      });
    }
  }, [open, profile, reset]);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    try {
      await updateProfile({
        summary: values.summary.trim() || null,
        seniority: values.seniority || null,
      }).unwrap();
      showSuccess("Profile updated");
      onOpenChange(false);
    } catch (err) {
      showError(`Couldn't update profile: ${extractErrorMessage(err)}`);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md max-h-[90vh] overflow-y-auto bg-card border rounded-lg shadow-lg z-50 p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">Edit profile</Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium mb-1">Seniority level</label>
              <select
                {...register("seniority")}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                {SENIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Professional summary</label>
              <textarea
                {...register("summary")}
                rows={4}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none"
                placeholder="A brief description of your professional background and goals..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button type="button" className="px-4 py-2 text-sm border rounded-md hover:bg-muted">
                  Cancel
                </button>
              </Dialog.Close>
              <LoadingButton type="submit" isLoading={isLoading} loadingText="Saving...">
                Save changes
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
