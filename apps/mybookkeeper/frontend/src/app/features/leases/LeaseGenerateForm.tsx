import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useCreateSignedLeaseMutation } from "@/shared/store/signedLeasesApi";
import { useGetGenerateDefaultsQuery } from "@/shared/store/leaseTemplatesApi";
import type { LeaseTemplateDetail } from "@/shared/types/lease/lease-template-detail";
import type { PlaceholderProvenance } from "@/shared/types/lease/placeholder-provenance";
import PlaceholderInput from "@/app/features/leases/PlaceholderInput";

export interface LeaseGenerateFormProps {
  template: LeaseTemplateDetail;
  applicantId: string;
  listingId?: string | null;
}

type ProvenanceMap = Record<string, PlaceholderProvenance>;
type ValuesMap = Record<string, string>;

/**
 * Form for filling in a template's placeholders to generate a draft lease.
 *
 * Three enhancements over PR #175:
 *
 * 1. **Auto-pull on applicant change** — when ``applicantId`` changes, all
 *    fields with a ``default_source`` re-pull from the new applicant + linked
 *    inquiry. Manual edits are overwritten by design.
 *
 * 2. **Inquiry fallback** — ``default_source`` chains (``applicant.X ||
 *    inquiry.Y``) are evaluated server-side; the resolved value and provenance
 *    are returned by ``GET /lease-templates/{id}/generate-defaults``.
 *
 * 3. **Provenance badges** — each field shows where its value came from
 *    (applicant / inquiry / manually edited). Editing a field transitions its
 *    badge to "manually edited". A "Pull from source" button re-runs the
 *    resolution and overwrites all fields.
 *
 * Computed and signature placeholders are hidden in this form — they're
 * resolved at generate / signing time.
 */
export default function LeaseGenerateForm({
  template,
  applicantId,
  listingId,
}: LeaseGenerateFormProps) {
  const navigate = useNavigate();
  const [createLease, { isLoading: isCreating }] = useCreateSignedLeaseMutation();

  const [values, setValues] = useState<ValuesMap>({});
  const [provenance, setProvenance] = useState<ProvenanceMap>({});

  // Track whether we're showing the "Pull from source" confirmation inline.
  const [showPullConfirm, setShowPullConfirm] = useState(false);

  const editablePlaceholders = useMemo(
    () =>
      template.placeholders.filter(
        (p) => p.input_type !== "signature" && p.input_type !== "computed",
      ),
    [template.placeholders],
  );

  const computedPlaceholders = useMemo(
    () => template.placeholders.filter((p) => p.input_type === "computed"),
    [template.placeholders],
  );

  // Fetch resolved defaults for the current applicant.
  const {
    data: defaultsData,
    isLoading: isLoadingDefaults,
    isFetching: isFetchingDefaults,
  } = useGetGenerateDefaultsQuery(
    { templateId: template.id, applicantId },
    { skip: !applicantId },
  );

  // Re-pull all fields whenever the resolved defaults change (i.e., applicantId
  // changed and a fresh fetch completed). This covers both the initial mount
  // and subsequent applicant switches.
  useEffect(() => {
    if (!defaultsData) return;
    applyDefaults(defaultsData.defaults);
  }, [defaultsData]); // applyDefaults uses only setState dispatch calls — stable, safe to omit

  function applyDefaults(
    defaults: Array<{ key: string; value: string | null; provenance: PlaceholderProvenance }>,
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
    // Any keystroke transitions provenance → "manual" if a source had populated it.
    setProvenance((prev) => {
      const current = prev[key];
      if (current === null || current === "manual") return prev;
      return { ...prev, [key]: "manual" };
    });
  }

  function handlePullFromSource(): void {
    // Re-apply the latest resolved defaults, overwriting all current values.
    if (defaultsData) {
      applyDefaults(defaultsData.defaults);
    }
    setShowPullConfirm(false);
  }

  const missingRequired = useMemo(
    () =>
      editablePlaceholders.filter(
        (p) => p.required && !(values[p.key] ?? "").trim(),
      ),
    [editablePlaceholders, values],
  );

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (missingRequired.length > 0) {
      showError(`Missing: ${missingRequired.map((p) => p.display_label).join(", ")}`);
      return;
    }
    try {
      const created = await createLease({
        template_id: template.id,
        applicant_id: applicantId,
        listing_id: listingId ?? null,
        values,
      }).unwrap();
      showSuccess("Draft lease created.");
      navigate(`/leases/${created.id}`);
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 422) showError("Some required fields are still missing.");
      else showError("Couldn't create the lease. Want to try again?");
    }
  }

  const isPulling = isLoadingDefaults || isFetchingDefaults;

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
        {editablePlaceholders.map((p) => (
          <PlaceholderInput
            key={p.id}
            placeholder={p}
            value={values[p.key] ?? ""}
            provenance={provenance[p.key] ?? null}
            onChange={(v) => handleFieldChange(p.key, v)}
          />
        ))}
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
