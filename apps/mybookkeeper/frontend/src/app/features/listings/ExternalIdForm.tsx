import { useState } from "react";
import { Button, FormField, LoadingButton, showError, showSuccess } from "@platform/ui";
import { LISTING_SOURCES, LISTING_SOURCE_LABELS } from "@mybookkeeper/api-client/constants/listingLabels";
import {
  useCreateListingExternalIdMutation,
  useUpdateListingExternalIdMutation,
} from "@mybookkeeper/api-client/store/listingsApi";
import { EXTERNAL_ID_MAX_LENGTH, EXTERNAL_ID_SOURCE_HINTS, EXTERNAL_URL_MAX_LENGTH } from "@mybookkeeper/api-client/constants/externalIdForm";
import type { ExternalIdRequestErrorShape } from "@mybookkeeper/api-client/types/listing/external-id-request-error-shape";
import type { ListingExternalId } from "@mybookkeeper/api-client/types/listing/listing-external-id";
import type { ListingSource } from "@mybookkeeper/api-client/types/listing/listing-source";
import { externalIdFormToRequest, externalIdProblem } from "@mybookkeeper/api-client/utils/externalIdForm";

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
 * Validation is the shared `externalIdProblem` rule set, the same one the phone uses:
 *   1. Source must be selected (create mode only — disabled in edit)
 *   2. At least one of (external_id, external_url) must be non-empty
 *   3. A URL must be an http(s) address
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problem = externalIdProblem(externalId, externalUrl);
    if (problem) {
      setValidationError(problem);
      return;
    }
    setValidationError(null);

    const fields = externalIdFormToRequest(externalId, externalUrl);

    try {
      if (isEdit) {
        await updateExternalId({
          listingId,
          externalIdPk: existing.id,
          data: fields,
        }).unwrap();
        showSuccess("External link updated.");
      } else {
        await createExternalId({
          listingId,
          data: { source, ...fields },
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
      noValidate
      data-testid="external-id-form"
      className="border rounded-lg p-4 space-y-3 bg-muted/30"
    >
      <h3 className="text-sm font-medium">
        {isEdit
          ? `Edit ${LISTING_SOURCE_LABELS[source]} link`
          : "Add external listing link"}
      </h3>

      <FormField label="Platform" required>
        {(field) => (
          <>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as ListingSource)}
              disabled={isEdit}
              data-testid="external-id-form-source"
              className="w-full min-h-[44px] rounded border bg-background px-3 py-2 text-sm disabled:bg-muted disabled:text-muted-foreground"
              {...field}
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
          </>
        )}
      </FormField>

      <FormField label={`${LISTING_SOURCE_LABELS[source]} ID`}>
        {(field) => (
          <>
            <input
              type="text"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder={EXTERNAL_ID_SOURCE_HINTS[source]}
              maxLength={EXTERNAL_ID_MAX_LENGTH}
              data-testid="external-id-form-external-id"
              className="w-full min-h-[44px] rounded border bg-background px-3 py-2 text-sm"
              {...field}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {EXTERNAL_ID_SOURCE_HINTS[source]}
            </p>
          </>
        )}
      </FormField>

      <FormField label={`${LISTING_SOURCE_LABELS[source]} URL`}>
        {(field) => (
          <input
            type="url"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="https://..."
            maxLength={EXTERNAL_URL_MAX_LENGTH}
            data-testid="external-id-form-external-url"
            className="w-full min-h-[44px] rounded border bg-background px-3 py-2 text-sm"
            {...field}
          />
        )}
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
