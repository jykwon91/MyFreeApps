import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { showError, showSuccess } from "@platform/ui";
import { useUpdateSectionMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import type { WelcomeManualSectionEditorValues } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-editor-values";
import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";
import { sectionUpdateRequest } from "@mybookkeeper/api-client/utils/welcomeManualRequests";

export interface UseSectionEditorArgs {
  manualId: string;
  section: WelcomeManualSectionResponse;
}

export interface UseSectionEditorResult {
  register: ReturnType<typeof useForm<WelcomeManualSectionEditorValues>>["register"];
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

  // Depend on the persisted VALUES, not the section object. Every mutation on
  // this manual (uploading a photo, adding a field, saving a caption, adding a
  // place) invalidates the whole manual tag, so `section` is a brand-new object
  // after each one even when its title and body are untouched.
  const serverTitle = section.title;
  const serverBody = section.body ?? "";

  const defaults = useMemo<WelcomeManualSectionEditorValues>(
    () => ({ title: serverTitle, body: serverBody }),
    [serverTitle, serverBody],
  );

  const {
    register,
    handleSubmit: rhfHandleSubmit,
    reset,
    watch,
    formState: { errors, dirtyFields, isDirty },
  } = useForm<WelcomeManualSectionEditorValues>({ defaultValues: defaults });

  // Re-baseline only when the persisted text actually changes — a successful
  // save, or an edit from elsewhere. Keying this on object identity meant a
  // photo upload mid-edit reset the form and discarded whatever the host had
  // typed but not yet saved.
  useEffect(() => {
    reset(defaults);
  }, [defaults, reset]);

  const bodyValue = watch("body");

  async function onSubmit(values: WelcomeManualSectionEditorValues) {
    const payload = sectionUpdateRequest(values, dirtyFields);
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
