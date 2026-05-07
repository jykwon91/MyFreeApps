import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useCreateSignedLeaseMutation } from "@/shared/store/signedLeasesApi";
import {
  useGetGenerateDefaultsQuery,
  useGetMultiGenerateDefaultsQuery,
} from "@/shared/store/leaseTemplatesApi";
import type { LeaseTemplateDetail } from "@/shared/types/lease/lease-template-detail";
import type { LeaseTemplatePlaceholder } from "@/shared/types/lease/lease-template-placeholder";
import type { PlaceholderProvenance } from "@/shared/types/lease/placeholder-provenance";
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
}

type ProvenanceMap = Record<string, PlaceholderProvenance>;
type ValuesMap = Record<string, string>;

interface MergedField {
  placeholder: LeaseTemplatePlaceholder;
  templateIds: string[];
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
}: LeaseGenerateFormProps) {
  const navigate = useNavigate();
  const [createLease, { isLoading: isCreating }] = useCreateSignedLeaseMutation();

  const [values, setValues] = useState<ValuesMap>({});
  const [provenance, setProvenance] = useState<ProvenanceMap>({});

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

  // ---------------------------------------------------------------------
  // Single-template defaults fetch (legacy path).
  // ---------------------------------------------------------------------
  const singleQueryArgs =
    template && !isMulti ? { templateId: template.id, applicantId } : undefined;
  const {
    data: singleDefaults,
    isLoading: isLoadingSingle,
    isFetching: isFetchingSingle,
  } = useGetGenerateDefaultsQuery(singleQueryArgs!, {
    skip: !singleQueryArgs || !applicantId,
  });

  // ---------------------------------------------------------------------
  // Multi-template defaults fetch.
  // ---------------------------------------------------------------------
  const multiQueryArgs =
    isMulti && submitTemplateIds.length > 0
      ? { template_ids: submitTemplateIds, applicant_id: applicantId }
      : undefined;
  const {
    data: multiDefaults,
    isLoading: isLoadingMulti,
    isFetching: isFetchingMulti,
  } = useGetMultiGenerateDefaultsQuery(multiQueryArgs!, {
    skip: !multiQueryArgs || !applicantId,
  });

  // ---------------------------------------------------------------------
  // Derive the form's placeholder list + initial defaults from whichever
  // query fired.
  // ---------------------------------------------------------------------
  const editableFields = useMemo<MergedField[]>(() => {
    if (isMulti) {
      if (!multiDefaults) return [];
      return multiDefaults.placeholders
        .filter(
          (m) =>
            m.placeholder.input_type !== "signature" &&
            m.placeholder.input_type !== "computed",
        )
        .map((m) => ({
          placeholder: m.placeholder,
          templateIds: m.template_ids,
        }));
    }
    if (!template) return [];
    return template.placeholders
      .filter(
        (p) => p.input_type !== "signature" && p.input_type !== "computed",
      )
      .map((p) => ({ placeholder: p, templateIds: [template.id] }));
  }, [isMulti, multiDefaults, template]);

  const computedPlaceholders = useMemo<LeaseTemplatePlaceholder[]>(() => {
    if (isMulti) {
      if (!multiDefaults) return [];
      return multiDefaults.placeholders
        .filter((m) => m.placeholder.input_type === "computed")
        .map((m) => m.placeholder);
    }
    if (!template) return [];
    return template.placeholders.filter((p) => p.input_type === "computed");
  }, [isMulti, multiDefaults, template]);

  // ---------------------------------------------------------------------
  // Apply defaults whenever the resolved data changes.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (isMulti) {
      if (!multiDefaults) return;
      const flattened = multiDefaults.placeholders
        .filter(
          (m) =>
            m.placeholder.input_type !== "signature" &&
            m.placeholder.input_type !== "computed",
        )
        .map((m) => ({
          key: m.placeholder.key,
          value: m.value,
          provenance: m.provenance,
        }));
      applyDefaults(flattened);
    } else {
      if (!singleDefaults) return;
      applyDefaults(singleDefaults.defaults);
    }
  }, [isMulti, singleDefaults, multiDefaults]); // applyDefaults is stable

  function applyDefaults(
    defaults: Array<{
      key: string;
      value: string | null;
      provenance: PlaceholderProvenance;
    }>,
  ): void {
    const nextValues: ValuesMap = {};
    const nextProvenance: ProvenanceMap = {};

    for (const d of defaults) {
      nextValues[d.key] = d.value ?? "";
      nextProvenance[d.key] = d.provenance;
    }

    setValues(nextValues);
    setProvenance(nextProvenance);
  }

  function handleFieldChange(key: string, next: string): void {
    setValues((prev) => ({ ...prev, [key]: next }));
    setProvenance((prev) => {
      const current = prev[key];
      if (current === null || current === "manual") return prev;
      return { ...prev, [key]: "manual" };
    });
  }

  function handlePullFromSource(): void {
    if (isMulti && multiDefaults) {
      applyDefaults(
        multiDefaults.placeholders
          .filter(
            (m) =>
              m.placeholder.input_type !== "signature" &&
              m.placeholder.input_type !== "computed",
          )
          .map((m) => ({
            key: m.placeholder.key,
            value: m.value,
            provenance: m.provenance,
          })),
      );
    } else if (singleDefaults) {
      applyDefaults(singleDefaults.defaults);
    }
    setShowPullConfirm(false);
  }

  const missingRequired = useMemo(
    () =>
      editableFields.filter(
        (f) => f.placeholder.required && !(values[f.placeholder.key] ?? "").trim(),
      ),
    [editableFields, values],
  );

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (missingRequired.length > 0) {
      showError(
        `Missing: ${missingRequired
          .map((f) => f.placeholder.display_label)
          .join(", ")}`,
      );
      return;
    }
    try {
      const created = await createLease({
        template_ids: submitTemplateIds,
        applicant_id: applicantId,
        listing_id: listingId ?? null,
        values,
      }).unwrap();
      showSuccess(
        submitTemplateIds.length > 1
          ? `Draft lease created with ${submitTemplateIds.length} documents.`
          : "Draft lease created.",
      );
      navigate(`/leases/${created.id}`);
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 422) showError("Some required fields are still missing.");
      else showError("Couldn't create the lease. Want to try again?");
    }
  }

  const isPulling = isMulti
    ? isLoadingMulti || isFetchingMulti
    : isLoadingSingle || isFetchingSingle;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="lease-generate-form">
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
            isLoading={isPulling}
            loadingText="Pulling..."
            onClick={() => setShowPullConfirm(true)}
            data-testid="pull-from-source-button"
          >
            Pull from source
          </LoadingButton>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {editableFields.map((f) => {
          const usedByLabels =
            isMulti && templateLabels && f.templateIds.length > 1
              ? f.templateIds
                  .map((id) => templateLabels[id])
                  .filter((label): label is string => Boolean(label))
              : [];
          return (
            <div key={f.placeholder.id}>
              <PlaceholderInput
                placeholder={f.placeholder}
                value={values[f.placeholder.key] ?? ""}
                provenance={provenance[f.placeholder.key] ?? null}
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
          isLoading={isCreating}
          loadingText="Creating draft..."
          disabled={missingRequired.length > 0}
          data-testid="lease-generate-submit"
        >
          Create draft lease
        </LoadingButton>
      </div>
    </form>
  );
}
