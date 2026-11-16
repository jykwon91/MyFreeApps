import { useState } from "react";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@/shared/lib/number-input-decimal-separator";
import { getApiErrorDetail } from "@/shared/lib/api-error-detail";
import { showError, showSuccess } from "@platform/ui";
import { benchmarkFormPayload, benchmarkFormProblems, benchmarkToFormValues } from "@mybookkeeper/api-client/utils/insuranceBenchmarkForm";
import { localToday } from "@platform/core/utils/localToday";
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
  const [initial] = useState(() => benchmarkToFormValues(existing, localToday()));
  const [premium, setPremium] = useState(initial.premium);
  const [coverage, setCoverage] = useState(initial.coverage);
  const [regionLabel, setRegionLabel] = useState(initial.regionLabel);
  const [source, setSource] = useState(initial.source);
  const [observedOn, setObservedOn] = useState(initial.observedOn);
  const [notes, setNotes] = useState(initial.notes);

  const [upsert, { isLoading: isSaving }] = useUpsertInsuranceBenchmarkMutation();
  const [remove, { isLoading: isRemoving }] = useDeleteInsuranceBenchmarkMutation();

  const [hasTried, setHasTried] = useState(false);
  const values = { premium, coverage, regionLabel, source, observedOn, notes };
  const today = localToday();
  const payload = benchmarkFormPayload(values, today, NUMBER_INPUT_DECIMAL_SEPARATOR);
  // Shown only once the operator has tried to save, so typing a figure isn't met with an error on the first digit.
  const problems = hasTried ? benchmarkFormProblems(values, today, NUMBER_INPUT_DECIMAL_SEPARATOR) : {};
  const isBusy = isSaving || isRemoving;
  const canSubmit = premium.trim() !== "" && coverage.trim() !== "" && observedOn !== "" && !isBusy;
  const canRemove = Boolean(existing) && !isBusy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setHasTried(true);
    if (payload === null) return;
    try {
      await upsert(payload).unwrap();
      showSuccess("Market premium saved.");
      onSaved();
    } catch (err) {
      // The form above already refuses everything the backend refuses, so a
      // rejection here is unexpected. A plain-string reason from the server is
      // still shown if there is one; a FastAPI validation list is not, and
      // falls back to the generic message.
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
    problems,
    maxObservedOn: today,
    handleSubmit,
    handleRemove,
  };
}
