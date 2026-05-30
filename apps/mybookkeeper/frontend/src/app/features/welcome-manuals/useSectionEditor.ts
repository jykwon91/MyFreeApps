import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useUpdateSectionMutation } from "@/shared/store/welcomeManualsApi";
import type { SectionEditorValues } from "@/shared/types/welcome-manual/section-editor-values";
import type { WelcomeManualSectionResponse } from "@/shared/types/welcome-manual/welcome-manual-section-response";
import type { WelcomeManualSectionUpdateRequest } from "@/shared/types/welcome-manual/welcome-manual-section-update-request";

function sectionToValues(section: WelcomeManualSectionResponse): SectionEditorValues {
  return { title: section.title, body: section.body ?? "" };
}

function valuesToUpdateRequest(
  values: SectionEditorValues,
  dirty: Partial<Record<keyof SectionEditorValues, boolean>>,
): WelcomeManualSectionUpdateRequest {
  const out: WelcomeManualSectionUpdateRequest = {};
  if (dirty.title) out.title = values.title.trim();
  if (dirty.body) out.body = values.body.trim() || null;
  return out;
}

export interface UseSectionEditorArgs {
  manualId: string;
  section: WelcomeManualSectionResponse;
}

export interface UseSectionEditorResult {
  register: ReturnType<typeof useForm<SectionEditorValues>>["register"];
  /** Wrapped submit handler — performs a dirty-only PATCH. */
  handleSubmit: () => void;
  /** Reset the form back to the server state (Cancel). */
  handleCancel: () => void;
  /** Current body value, for the live markdown preview. */
  bodyValue: string;
  /** True when at least one field differs from the server state. */
  isDirty: boolean;
  isSaving: boolean;
  titleError: string | undefined;
}

/**
 * Per-section editor state: title input + markdown body, dirty-only PATCH,
 * cancel-to-server-state. One instance per section card.
 */
export function useSectionEditor({ manualId, section }: UseSectionEditorArgs): UseSectionEditorResult {
  const [updateSection, { isLoading: isSaving }] = useUpdateSectionMutation();

  const defaults = useMemo<SectionEditorValues>(() => sectionToValues(section), [section]);

  const {
    register,
    handleSubmit: rhfHandleSubmit,
    reset,
    watch,
    formState: { errors, dirtyFields, isDirty },
  } = useForm<SectionEditorValues>({ defaultValues: defaults });

  // Re-baseline when the server value changes (after a successful save/refetch
  // or an external edit) so "dirty" reflects the latest persisted state.
  useEffect(() => {
    reset(defaults);
  }, [defaults, reset]);

  const bodyValue = watch("body");

  async function onSubmit(values: SectionEditorValues) {
    const payload = valuesToUpdateRequest(values, dirtyFields);
    if (Object.keys(payload).length === 0) return;
    try {
      await updateSection({ manualId, sectionId: section.id, data: payload }).unwrap();
      showSuccess("Section saved.");
    } catch {
      showError("I couldn't save that section. Want to try again?");
    }
  }

  return {
    register,
    handleSubmit: rhfHandleSubmit(onSubmit),
    handleCancel: () => reset(defaults),
    bodyValue,
    isDirty,
    isSaving,
    titleError: errors.title?.message,
  };
}
