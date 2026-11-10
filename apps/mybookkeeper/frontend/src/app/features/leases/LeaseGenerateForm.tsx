import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingButton, showError, showSuccess } from "@platform/ui";
import { useCreateSignedLeaseMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { useGetMultiGenerateDefaultsQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { useGetGenerateDefaultsQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import type { LeaseTemplateDetail } from "@mybookkeeper/api-client/types/lease/lease-template-detail";
import type { LeaseTemplatePlaceholder } from "@mybookkeeper/api-client/types/lease/lease-template-placeholder";
import type { MergedPlaceholder } from "@mybookkeeper/api-client/types/lease/merged-placeholder";
import type { PlaceholderEdits } from "@mybookkeeper/api-client/types/lease/placeholder-edits";
import {
  leaseValues,
  missingRequired,
  placeholderProvenance,
  placeholderValue,
} from "@mybookkeeper/api-client/utils/leaseFormValues";
import { askedFields, computedFields, isAskedPlaceholder, singleTemplateFields } from "@mybookkeeper/api-client/utils/leasePlaceholders";
import LeaseGenerateFormFieldsSkeleton from "@/app/features/leases/LeaseGenerateFormFieldsSkeleton";
import { MULTI_TEMPLATE_SKELETON_FIELD_COUNT } from "@/shared/lib/lease-generate-constants";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import PlaceholderInput from "@/app/features/leases/PlaceholderInput";

export interface LeaseGenerateFormProps {
  /** Single-template legacy mode. Mutually exclusive with `templateIds`. */
  template?: LeaseTemplateDetail;
  /** Multi-template mode — IDs in pick order; first wins on key conflicts. */
  templateIds?: string[];
  /** Display labels for the picked templates (for the "Used by" hint). */
  templateLabels?: Record<string, string>;
  applicantId: string;
  listingId?: string | null;
  /** When set, the new lease is created as a successor to this parent. */
  parentLeaseId?: string | null;
}

/**
 * Form for filling in placeholder values to generate a draft lease.
 *
 * Two modes:
 *   1. **Single-template** — pass `template` (legacy callers / tests).
 *   2. **Multi-template** — pass `templateIds` (the canonical flow on
 *      `/leases/new`). The form merges placeholders across all selected
 *      templates using first-template-wins on key conflicts and shows the
 *      list of contributing templates next to the field as a hint.
 *
 * Auto-pull / provenance / pull-from-source behaviour mirrors single-template
 * mode — keystrokes flip provenance to "manual"; the "Pull from source"
 * button restores the resolved defaults.
 */
export default function LeaseGenerateForm({
  template,
  templateIds,
  templateLabels,
  applicantId,
  listingId,
  parentLeaseId,
}: LeaseGenerateFormProps) {
  const navigate = useNavigate();
  const [createLease, { isLoading: isCreating }] = useCreateSignedLeaseMutation();

  const [edits, setEdits] = useState<PlaceholderEdits>({});

  // Track whether we're showing the "Pull from source" confirmation inline.
  const [showPullConfirm, setShowPullConfirm] = useState(false);

  const isMulti = templateIds !== undefined;

  // Resolve the canonical list of template IDs the form should submit with.
  // Memoise so referential equality holds across renders unless the input changes.
  const submitTemplateIds = useMemo<string[]>(() => {
    if (templateIds && templateIds.length > 0) return templateIds;
    if (template) return [template.id];
    return [];
  }, [templateIds, template]);

  // currentData (not data) so a defaults response for another applicant is never shown.
  const singleQueryArgs =
    template && !isMulti ? { templateId: template.id, applicantId } : undefined;
  const singleQuery = useGetGenerateDefaultsQuery(singleQueryArgs!, {
    skip: !singleQueryArgs || !applicantId,
  });
  const multiQueryArgs =
    isMulti && submitTemplateIds.length > 0
      ? { template_ids: submitTemplateIds, applicant_id: applicantId }
      : undefined;
  const multiQuery = useGetMultiGenerateDefaultsQuery(multiQueryArgs!, {
    skip: !multiQueryArgs || !applicantId,
  });

  const activeQuery = isMulti ? multiQuery : singleQuery;
  const singleDefaults = singleQuery.currentData;
  const multiDefaults = multiQuery.currentData;
  const hasDefaults = isMulti ? multiDefaults !== undefined : singleDefaults !== undefined;
  const isLoadingDefaults = !hasDefaults && activeQuery.error === undefined;
  const loadFailed = !hasDefaults && activeQuery.error !== undefined;

  // Both modes yield the same shape: only the asked fields, each with its pulled value.
  const editableFields = useMemo<MergedPlaceholder[]>(() => {
    if (isMulti) {
      return askedFields(multiDefaults?.placeholders ?? []);
    }
    if (!template || !singleDefaults) return [];
    return askedFields(singleTemplateFields(template.id, template.placeholders, singleDefaults.defaults));
  }, [isMulti, multiDefaults, singleDefaults, template]);

  const computedPlaceholders = useMemo<LeaseTemplatePlaceholder[]>(() => {
    if (isMulti) {
      return computedFields(multiDefaults?.placeholders ?? []).map((m) => m.placeholder);
    }
    if (!template) return [];
    return template.placeholders.filter((p) => p.input_type === "computed");
  }, [isMulti, multiDefaults, template]);

  function handleFieldChange(key: string, next: string): void {
    setEdits((prev) => ({ ...prev, [key]: next }));
  }

  function handlePullFromSource(): void {
    setEdits({});
    setShowPullConfirm(false);
  }

  const skeletonFieldCount = isMulti
    ? MULTI_TEMPLATE_SKELETON_FIELD_COUNT
    : template
      ? template.placeholders.filter(isAskedPlaceholder).length
      : 0;

  const missing = missingRequired(editableFields, edits);
  // Blocked only until the first defaults arrive; a background refetch keeps the
  // current data (and the user's edits) in place and must not block submit.
  const isBlocked = !hasDefaults;

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    // Backstop: a disabled default button already blocks implicit (Enter)
    // submission, but never post before the defaults have loaded.
    if (isBlocked || isCreating) return;
    if (missing.length > 0) {
      showError(
        `Missing: ${missing.map((f) => f.placeholder.display_label).join(", ")}`,
      );
      return;
    }
    try {
      const created = await createLease({
        template_ids: submitTemplateIds,
        applicant_id: applicantId,
        listing_id: listingId ?? null,
        values: leaseValues(editableFields, edits),
        ...(parentLeaseId ? { parent_lease_id: parentLeaseId } : {}),
      }).unwrap();
      showSuccess(
        submitTemplateIds.length > 1
          ? `Draft lease created with ${submitTemplateIds.length} documents.`
          : "Draft lease created.",
      );
      navigate(`/leases/${created.id}`);
    } catch (e: unknown) {
      const err = e as {
        status?: number;
        data?: { detail?: unknown };
      };
      const detail = err.data?.detail;
      const code =
        detail && typeof detail === "object"
          ? (detail as { code?: unknown }).code
          : undefined;
      if (code === "INVALID_PARENT_LEASE") {
        showError(
          "The parent lease can't have a successor in its current state.",
        );
      } else if (code === "SUCCESSOR_ALREADY_EXISTS") {
        showError(
          "That lease already has a successor — open the existing one instead.",
        );
      } else if (err.status === 422) {
        showError("Some required fields are still missing.");
      } else {
        showError("Couldn't create the lease. Want to try again?");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="lease-generate-form">
      {loadFailed ? (
        <LoadErrorAlert
          message="I couldn't load the details for this lease. Want me to try again?"
          isRetrying={activeQuery.isFetching}
          onRetry={() => void activeQuery.refetch()}
        />
      ) : null}
      {/* Pull from source button + inline confirmation */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Fields marked with a badge are auto-filled from the applicant or inquiry.
        </p>
        {showPullConfirm ? (
          <div
            className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-xs"
            data-testid="pull-from-source-confirm"
          >
            <span>This will replace your edits. Continue?</span>
            <button
              type="button"
              onClick={handlePullFromSource}
              className="font-medium text-primary hover:underline"
              data-testid="pull-from-source-confirm-yes"
            >
              Yes, pull
            </button>
            <button
              type="button"
              onClick={() => setShowPullConfirm(false)}
              className="text-muted-foreground hover:text-foreground"
              data-testid="pull-from-source-confirm-no"
            >
              Cancel
            </button>
          </div>
        ) : (
          <LoadingButton
            type="button"
            variant="secondary"
            size="sm"
            isLoading={activeQuery.isFetching}
            loadingText="Pulling..."
            onClick={() => setShowPullConfirm(true)}
            data-testid="pull-from-source-button"
          >
            Pull from source
          </LoadingButton>
        )}
      </div>

      {isLoadingDefaults ? (
        <LeaseGenerateFormFieldsSkeleton fieldCount={skeletonFieldCount} />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="lease-generate-fields">
        {editableFields.map((f) => {
          const usedByLabels =
            isMulti && templateLabels && f.template_ids.length > 1
              ? f.template_ids
                  .map((id) => templateLabels[id])
                  .filter((label): label is string => Boolean(label))
              : [];
          return (
            <div key={f.placeholder.id}>
              <PlaceholderInput
                placeholder={f.placeholder}
                value={placeholderValue(f, edits)}
                provenance={placeholderProvenance(f, edits)}
                onChange={(v) => handleFieldChange(f.placeholder.key, v)}
              />
              {usedByLabels.length > 0 ? (
                <p
                  className="mt-1 text-xs text-muted-foreground"
                  data-testid={`placeholder-used-by-${f.placeholder.key}`}
                >
                  Used by: {usedByLabels.join(", ")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      )}

      {computedPlaceholders.length > 0 ? (
        <div className="border rounded-md p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium">Computed (auto-filled at generate time):</p>
          {computedPlaceholders.map((p) => (
            <div key={p.id} className="font-mono">
              [{p.key}] = {p.computed_expr ?? "(unset)"}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex justify-end">
        <LoadingButton
          type="submit"
          isLoading={isCreating || isLoadingDefaults}
          loadingText={isCreating ? "Creating draft..." : "Loading details..."}
          disabled={isBlocked || missing.length > 0}
          data-testid="lease-generate-submit"
        >
          Create draft lease
        </LoadingButton>
      </div>
    </form>
  );
}
