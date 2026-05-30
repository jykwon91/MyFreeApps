import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { X } from "lucide-react";
import Panel from "@/shared/components/ui/Panel";
import FormField from "@/shared/components/ui/FormField";
import Markdown from "@/shared/components/ui/Markdown";
import { LoadingButton } from "@platform/ui";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useUpdateWelcomeManualMutation } from "@/shared/store/welcomeManualsApi";
import type { Property } from "@/shared/types/property/property";
import type { WelcomeManualFormValues } from "@/shared/types/welcome-manual/welcome-manual-form-values";
import type { WelcomeManualResponse } from "@/shared/types/welcome-manual/welcome-manual-response";
import type { WelcomeManualUpdateRequest } from "@/shared/types/welcome-manual/welcome-manual-update-request";

export interface WelcomeManualFormProps {
  manual: WelcomeManualResponse;
  properties: readonly Property[];
  onClose: () => void;
  onUpdated: (manual: WelcomeManualResponse) => void;
}

function manualToFormValues(manual: WelcomeManualResponse): WelcomeManualFormValues {
  return {
    title: manual.title,
    intro_text: manual.intro_text ?? "",
    property_id: manual.property_id ?? "",
  };
}

function formValuesToUpdateRequest(
  values: WelcomeManualFormValues,
  dirty: Partial<Record<keyof WelcomeManualFormValues, boolean>>,
): WelcomeManualUpdateRequest {
  const out: WelcomeManualUpdateRequest = {};
  if (dirty.title) out.title = values.title.trim();
  if (dirty.intro_text) out.intro_text = values.intro_text.trim() || null;
  if (dirty.property_id) out.property_id = values.property_id || null;
  return out;
}

export default function WelcomeManualForm({
  manual,
  properties,
  onClose,
  onUpdated,
}: WelcomeManualFormProps) {
  const [updateManual, { isLoading }] = useUpdateWelcomeManualMutation();

  const defaults = useMemo<WelcomeManualFormValues>(() => manualToFormValues(manual), [manual]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, dirtyFields },
  } = useForm<WelcomeManualFormValues>({ defaultValues: defaults });

  useEffect(() => {
    reset(defaults);
  }, [defaults, reset]);

  const watchIntro = watch("intro_text");

  async function onSubmit(values: WelcomeManualFormValues) {
    const payload = formValuesToUpdateRequest(values, dirtyFields);
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    try {
      const updated = await updateManual({ id: manual.id, data: payload }).unwrap();
      showSuccess("Welcome manual updated.");
      onUpdated(updated);
      onClose();
    } catch {
      showError("I couldn't save those changes. Want to try again?");
    }
  }

  return (
    <Panel position="right" onClose={onClose}>
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-5 py-4 border-b flex items-start justify-between">
          <div>
            <h3 className="font-medium text-base">Edit manual</h3>
            <p className="text-xs text-muted-foreground">Update the title, intro, or property.</p>
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
          id="welcome-manual-edit-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
          data-testid="welcome-manual-edit-form"
        >
          <FormField label="Title" required>
            <input
              {...register("title", { required: "Title is required" })}
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              data-testid="welcome-manual-edit-title"
            />
            {errors.title ? (
              <p className="text-xs text-red-600 mt-1">{errors.title.message}</p>
            ) : null}
          </FormField>

          <FormField label="Intro">
            <textarea
              {...register("intro_text")}
              rows={4}
              className="w-full border rounded-md px-3 py-2 text-sm"
              data-testid="welcome-manual-edit-intro"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Supports markdown — **bold**, *italic*, lists, headings, links.
            </p>
          </FormField>
          {watchIntro ? (
            <div data-testid="welcome-manual-edit-intro-preview">
              <p className="text-xs text-muted-foreground mb-1">Preview</p>
              <div className="border rounded-md px-3 py-2 bg-muted/30 min-h-[60px]">
                <Markdown content={watchIntro} />
              </div>
            </div>
          ) : null}

          <FormField label="Property (optional)">
            <select
              {...register("property_id")}
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
              data-testid="welcome-manual-edit-property"
            >
              <option value="">No property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>
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
            form="welcome-manual-edit-form"
            isLoading={isLoading}
            loadingText="Saving..."
            data-testid="welcome-manual-edit-submit"
          >
            Save
          </LoadingButton>
        </div>
      </div>
    </Panel>
  );
}
