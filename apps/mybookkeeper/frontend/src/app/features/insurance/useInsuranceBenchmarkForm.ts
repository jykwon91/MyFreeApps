import { useState } from "react";
import { getApiErrorDetail } from "@/shared/lib/api-error-detail";
import { showError, showSuccess } from "@platform/ui";
import { positiveDollarsToCents } from "@mybookkeeper/api-client/utils/insuranceBenchmarkForm";
import { localToday } from "@mybookkeeper/api-client/utils/localToday";
import {
  useDeleteInsuranceBenchmarkMutation,
  useUpsertInsuranceBenchmarkMutation,
} from "@mybookkeeper/api-client/store/insuranceBenchmarksApi";
import type { InsuranceBenchmark } from "@mybookkeeper/api-client/types/insurance/insurance-benchmark";

interface UseInsuranceBenchmarkFormArgs {
  existing: InsuranceBenchmark | null | undefined;
  onSaved: () => void;
}

/**
 * Form state for the organization's single insurance benchmark.
 *
 * Both figures are required, and deliberately so: the comparison runs on
 * premium *per $1,000 of coverage*, so a quoted premium with no coverage
 * behind it cannot be normalised. Accepting it would store a benchmark that
 * silently matches nothing — worse than refusing it, because the operator
 * would believe their policies were being checked.
 */
export function useInsuranceBenchmarkForm({
  existing,
  onSaved,
}: UseInsuranceBenchmarkFormArgs) {
  const [premium, setPremium] = useState(() =>
    existing ? (existing.annual_premium_cents / 100).toFixed(2) : "",
  );
  const [coverage, setCoverage] = useState(() =>
    existing ? (existing.coverage_amount_cents / 100).toFixed(0) : "",
  );
  const [regionLabel, setRegionLabel] = useState(existing?.region_label ?? "");
  const [source, setSource] = useState(existing?.source ?? "");
  const [observedOn, setObservedOn] = useState(existing?.observed_on ?? localToday());
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const [upsert, { isLoading: isSaving }] = useUpsertInsuranceBenchmarkMutation();
  const [remove, { isLoading: isRemoving }] = useDeleteInsuranceBenchmarkMutation();

  const premiumCents = positiveDollarsToCents(premium);
  const coverageCents = positiveDollarsToCents(coverage);
  const isBusy = isSaving || isRemoving;
  const canSubmit =
    premiumCents !== null && coverageCents !== null && observedOn !== "" && !isBusy;
  const canRemove = Boolean(existing) && !isBusy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (premiumCents === null || coverageCents === null || !canSubmit) return;
    try {
      await upsert({
        annual_premium_cents: premiumCents,
        coverage_amount_cents: coverageCents,
        region_label: regionLabel.trim() === "" ? null : regionLabel.trim(),
        source: source.trim() === "" ? null : source.trim(),
        observed_on: observedOn,
        notes: notes.trim() === "" ? null : notes.trim(),
      }).unwrap();
      showSuccess("Market premium saved.");
      onSaved();
    } catch (err) {
      // The backend names the rule the payload broke — a future observation
      // date, a figure past the cents/dollars sanity cap. A generic "try
      // again" would send the operator to retype a value rejected identically.
      showError(
        getApiErrorDetail(err, "Couldn't save the market premium. Please try again."),
      );
    }
  }

  async function handleRemove() {
    if (!canRemove) return;
    try {
      await remove().unwrap();
      showSuccess("Market premium removed.");
      onSaved();
    } catch (err) {
      showError(
        getApiErrorDetail(err, "Couldn't remove the market premium. Please try again."),
      );
    }
  }

  return {
    premium,
    setPremium,
    coverage,
    setCoverage,
    regionLabel,
    setRegionLabel,
    source,
    setSource,
    observedOn,
    setObservedOn,
    notes,
    setNotes,
    isSaving,
    isRemoving,
    canSubmit,
    canRemove,
    maxObservedOn: localToday(),
    handleSubmit,
    handleRemove,
  };
}
