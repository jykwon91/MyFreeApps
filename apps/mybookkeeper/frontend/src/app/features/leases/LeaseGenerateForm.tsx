import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useCreateSignedLeaseMutation } from "@/shared/store/signedLeasesApi";
import type { LeaseTemplateDetail } from "@/shared/types/lease/lease-template-detail";
import PlaceholderInput from "@/app/features/leases/PlaceholderInput";

interface Props {
  template: LeaseTemplateDetail;
  applicantId: string;
  listingId?: string | null;
  /**
   * Optional initial values pre-populated from applicant fields. Keys must
   * match the template's placeholder ``key`` strings.
   */
  initialValues?: Record<string, string>;
}

/**
 * Form for filling in a template's placeholders to generate a draft lease.
 *
 * Computed placeholders are NOT user-editable — they're shown as previewed
 * values that update live as their dependencies change.
 *
 * Required placeholders block submission until filled. Signature placeholders
 * are filled at signing time so they're hidden in this form.
 */
export default function LeaseGenerateForm({
  template,
  applicantId,
  listingId,
  initialValues = {},
}: Props) {
  const navigate = useNavigate();
  const [createLease, { isLoading }] = useCreateSignedLeaseMutation();

  // Initial seed comes from ``initialValues`` filtered to the template's
  // user-fillable placeholder keys. Computed by ``useState``'s initialiser
  // function — runs once on mount per (template, applicantId) — see the
  // ``key`` prop on the parent LeaseDetail / generate route to remount this
  // component when the user picks a different template.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const p of template.placeholders) {
      if (p.input_type === "signature" || p.input_type === "computed") continue;
      if (initialValues[p.key]) seed[p.key] = initialValues[p.key];
    }
    return seed;
  });

  const editablePlaceholders = useMemo(
    () =>
      template.placeholders.filter(
        (p) => p.input_type !== "signature" && p.input_type !== "computed",
      ),
    [template.placeholders],
  );

  const computedPlaceholders = useMemo(
    () =>
      template.placeholders.filter((p) => p.input_type === "computed"),
    [template.placeholders],
  );

  const missingRequired = useMemo(
    () =>
      editablePlaceholders.filter(
        (p) => p.required && !(values[p.key] ?? "").trim(),
      ),
    [editablePlaceholders, values],
  );

  async function handleSubmit(e: React.FormEvent) {
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="lease-generate-form">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {editablePlaceholders.map((p) => (
          <PlaceholderInput
            key={p.id}
            placeholder={p}
            value={values[p.key] ?? ""}
            onChange={(v) => setValues((prev) => ({ ...prev, [p.key]: v }))}
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
          isLoading={isLoading}
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
