import { useForm } from "react-hook-form";
import { X } from "lucide-react";
import Panel from "@/shared/components/ui/Panel";
import FormField from "@/shared/components/ui/FormField";
import { LoadingButton } from "@platform/ui";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useCreateWelcomeManualMutation } from "@/shared/store/welcomeManualsApi";
import type { Property } from "@/shared/types/property/property";
import type { WelcomeManualCreateFormValues } from "@/shared/types/welcome-manual/welcome-manual-create-form-values";
import type { WelcomeManualCreateRequest } from "@/shared/types/welcome-manual/welcome-manual-create-request";
import type { WelcomeManualResponse } from "@/shared/types/welcome-manual/welcome-manual-response";

export interface WelcomeManualCreateDialogProps {
  properties: readonly Property[];
  onClose: () => void;
  onCreated: (manual: WelcomeManualResponse) => void;
}

const DEFAULTS: WelcomeManualCreateFormValues = {
  title: "",
  property_id: "",
  seed_default_sections: true,
};

function formValuesToCreateRequest(values: WelcomeManualCreateFormValues): WelcomeManualCreateRequest {
  return {
    title: values.title.trim(),
    property_id: values.property_id || null,
    seed_default_sections: values.seed_default_sections,
  };
}

export default function WelcomeManualCreateDialog({
  properties,
  onClose,
  onCreated,
}: WelcomeManualCreateDialogProps) {
  const [createManual, { isLoading }] = useCreateWelcomeManualMutation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WelcomeManualCreateFormValues>({ defaultValues: DEFAULTS });

  async function onSubmit(values: WelcomeManualCreateFormValues) {
    try {
      const created = await createManual(formValuesToCreateRequest(values)).unwrap();
      showSuccess("Welcome manual created.");
      onCreated(created);
    } catch {
      showError("I couldn't create that guide. Want to try again?");
    }
  }

  return (
    <Panel position="right" onClose={onClose}>
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-5 py-4 border-b flex items-start justify-between">
          <div>
            <h3 className="font-medium text-base">New welcome manual</h3>
            <p className="text-xs text-muted-foreground">
              A guide you can email to guests with everything they need to know.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Close panel"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <form
          id="welcome-manual-create-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          data-testid="welcome-manual-create-form"
        >
          <FormField label="Title" required>
            <input
              {...register("title", { required: "Title is required" })}
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              placeholder="e.g. Welcome to the Lakeview Suite"
              data-testid="welcome-manual-create-title"
            />
            {errors.title ? (
              <p className="text-xs text-red-600 mt-1">{errors.title.message}</p>
            ) : null}
          </FormField>

          <FormField label="Property (optional)">
            <select
              {...register("property_id")}
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              data-testid="welcome-manual-create-property"
            >
              <option value="">No property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>

          <label className="flex items-start gap-2 text-sm min-h-[44px]">
            <input
              type="checkbox"
              className="mt-1"
              {...register("seed_default_sections")}
              data-testid="welcome-manual-create-seed"
            />
            <span>
              Start with common sections
              <span className="block text-xs text-muted-foreground">
                Pre-fills Wi-Fi, Parking, Trash &amp; Recycling, Laundry, and Check-out
                stubs so you start from a structure instead of a blank page.
              </span>
            </span>
          </label>
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground min-h-[44px] px-3"
          >
            Cancel
          </button>
          <LoadingButton
            type="submit"
            form="welcome-manual-create-form"
            isLoading={isLoading}
            loadingText="Creating..."
            data-testid="welcome-manual-create-submit"
          >
            Create guide
          </LoadingButton>
        </div>
      </div>
    </Panel>
  );
}
