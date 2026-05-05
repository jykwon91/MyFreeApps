import { useState } from "react";
import Button from "@/shared/components/ui/Button";
import FormField from "@/shared/components/ui/FormField";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import {
  LISTING_SOURCES,
  LISTING_SOURCE_LABELS,
} from "@/shared/lib/listing-labels";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useCreateListingExternalIdMutation,
  useUpdateListingExternalIdMutation,
} from "@/shared/store/listingsApi";
import {
  EXTERNAL_ID_SOURCE_HINTS,
  ExternalIdRequestErrorShape,
} from "@/shared/lib/external-id-form";
import type { ListingExternalId } from "@/shared/types/listing/listing-external-id";
import type { ListingSource } from "@/shared/types/listing/listing-source";

export interface ExternalIdFormProps {
  listingId: string;
  /** When undefined, the form is in create mode. */
  existing?: ListingExternalId;
  /** Sources already linked on this listing — excluded from the dropdown
   * in create mode. The current row's source is always allowed in edit
   * mode (source is immutable but visible). */
  linkedSources: readonly ListingSource[];
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Create / edit form for a single external-ID linkage.
 *
 * Validation enforced client-side:
 *   1. Source must be selected (create mode only — disabled in edit)
 *   2. At least one of (external_id, external_url) must be non-empty
 * Conflict 409 responses from the server surface as toast banners; the
 * form remains open so the host can correct the input.
 */
export default function ExternalIdForm({
  listingId,
  existing,
  linkedSources,
  onSuccess,
  onCancel,
}: ExternalIdFormProps) {
  const isEdit = existing !== undefined;
  const availableSources = isEdit
    ? LISTING_SOURCES
    : LISTING_SOURCES.filter((s) => !linkedSources.includes(s));

  const initialSource: ListingSource =
    existing?.source ?? availableSources[0] ?? "FF";

  const [source, setSource] = useState<ListingSource>(initialSource);
  const [externalId, setExternalId] = useState<string>(
    existing?.external_id ?? "",
  );
  const [externalUrl, setExternalUrl] = useState<string>(
    existing?.external_url ?? "",
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const [createExternalId, { isLoading: isCreating }] =
    useCreateListingExternalIdMutation();
  const [updateExternalId, { isLoading: isUpdating }] =
    useUpdateListingExternalIdMutation();

  const isSubmitting = isCreating || isUpdating;
  const formIsValid = externalId.trim() !== "" || externalUrl.trim() !== "";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!formIsValid) {
      setValidationError(
        "Enter at least an external ID or a URL — a row with neither has nothing to link to.",
      );
      return;
    }
    setValidationError(null);

    const trimmedId = externalId.trim();
    const trimmedUrl = externalUrl.trim();

    try {
      if (isEdit) {
        await updateExternalId({
          listingId,
          externalIdPk: existing.id,
          data: {
            external_id: trimmedId === "" ? null : trimmedId,
            external_url: trimmedUrl === "" ? null : trimmedUrl,
          },
        }).unwrap();
        showSuccess("External link updated.");
      } else {
        await createExternalId({
          listingId,
          data: {
            source,
            external_id: trimmedId === "" ? null : trimmedId,
            external_url: trimmedUrl === "" ? null : trimmedUrl,
          },
        }).unwrap();
        showSuccess("External link added.");
      }
      onSuccess();
    } catch (err) {
      const detail = (err as ExternalIdRequestErrorShape)?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : "I couldn't save that link. Want me to try again?";
      showError(message);
    }
  }

  const submitLabel = isEdit ? "Save" : "Add link";
  const loadingLabel = isEdit ? "Saving..." : "Adding...";

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="external-id-form"
      className="border rounded-lg p-4 space-y-3 bg-muted/30"
    >
      <h3 className="text-sm font-medium">
        {isEdit
          ? `Edit ${LISTING_SOURCE_LABELS[source]} link`
          : "Add external listing link"}
      </h3>

      <FormField label="Platform" required>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as ListingSource)}
          disabled={isEdit}
          aria-label="Platform source"
          data-testid="external-id-form-source"
          className="w-full min-h-[44px] rounded border bg-background px-3 py-2 text-sm disabled:bg-muted disabled:text-muted-foreground"
        >
          {availableSources.map((s) => (
            <option key={s} value={s}>
              {LISTING_SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
        {!isEdit && availableSources.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-1">
            All platforms are already linked. Edit or remove an existing link
            to free up a slot.
          </p>
        ) : null}
      </FormField>

      <FormField label={`${LISTING_SOURCE_LABELS[source]} ID`}>
        <input
          type="text"
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          placeholder={EXTERNAL_ID_SOURCE_HINTS[source]}
          maxLength={100}
          data-testid="external-id-form-external-id"
          className="w-full min-h-[44px] rounded border bg-background px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {EXTERNAL_ID_SOURCE_HINTS[source]}
        </p>
      </FormField>

      <FormField label={`${LISTING_SOURCE_LABELS[source]} URL`}>
        <input
          type="url"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          placeholder="https://..."
          maxLength={500}
          data-testid="external-id-form-external-url"
          className="w-full min-h-[44px] rounded border bg-background px-3 py-2 text-sm"
        />
      </FormField>

      {validationError ? (
        <p
          role="alert"
          data-testid="external-id-form-validation-error"
          className="text-xs text-red-600"
        >
          {validationError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={onCancel}
          disabled={isSubmitting}
          data-testid="external-id-form-cancel"
        >
          Cancel
        </Button>
        <LoadingButton
          type="submit"
          variant="primary"
          size="md"
          isLoading={isSubmitting}
          loadingText={loadingLabel}
          disabled={!isEdit && availableSources.length === 0}
          data-testid="external-id-form-submit"
        >
          {submitLabel}
        </LoadingButton>
      </div>
    </form>
  );
}
