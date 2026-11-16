import { useState } from "react";
import { getApiErrorDetail } from "@/shared/lib/api-error-detail";
import { showError, showSuccess } from "@platform/ui";
import { localToday } from "@platform/core/utils/localToday";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@/shared/lib/number-input-decimal-separator";
import {
  useDeleteMarketRateBenchmarkMutation,
  useUpsertMarketRateBenchmarkMutation,
} from "@mybookkeeper/api-client/store/marketRateBenchmarksApi";
import type { MarketRateBenchmark } from "@mybookkeeper/api-client/types/utility/market-rate-benchmark";
import {
  isFlatService,
  marketRateFormProblems,
  marketRateToFormValues,
  toMarketRateUpsert,
} from "@mybookkeeper/api-client/utils/marketRateForm";
import type { UtilityServiceType } from "@mybookkeeper/api-client/types/utility/utility-service-type";

interface UseMarketRateBenchmarkFormArgs {
  serviceType: UtilityServiceType;
  existing: MarketRateBenchmark | undefined;
  onSaved: () => void;
}

/**
 * Form state for recording one market rate.
 *
 * Which figure is asked for follows the service type rather than being a
 * choice: internet is quoted per month, everything else per kWh. Letting the
 * operator pick would only create a way to record a rate in the unit the
 * comparison cannot use.
 */
export function useMarketRateBenchmarkForm({
  serviceType,
  existing,
  onSaved,
}: UseMarketRateBenchmarkFormArgs) {
  const isFlat = isFlatService(serviceType);
  const initial = marketRateToFormValues(serviceType, existing);

  const [figure, setFigure] = useState(initial.figure);
  const [source, setSource] = useState(initial.source);
  const [observedOn, setObservedOn] = useState(initial.observedOn);
  const [notes, setNotes] = useState(initial.notes);

  const [upsert, { isLoading: isSaving }] = useUpsertMarketRateBenchmarkMutation();
  const [remove, { isLoading: isRemoving }] = useDeleteMarketRateBenchmarkMutation();

  const [hasTried, setHasTried] = useState(false);
  const allProblems = marketRateFormProblems(serviceType, { figure, source, observedOn, notes }, localToday(), NUMBER_INPUT_DECIMAL_SEPARATOR);
  // Shown only once the operator has tried to save, so typing a rate isn't met with an error on the first digit.
  const problems = hasTried ? allProblems : {};
  const isBusy = isSaving || isRemoving;
  const canSubmit = figure.trim() !== "" && observedOn !== "" && !isBusy;
  const canRemove = existing !== undefined && !isBusy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setHasTried(true);
    if (Object.keys(allProblems).length > 0) return;
    try {
      await upsert({
        serviceType,
        data: toMarketRateUpsert(serviceType, { figure, source, observedOn, notes }, NUMBER_INPUT_DECIMAL_SEPARATOR),
      }).unwrap();
      showSuccess("Market rate saved.");
      onSaved();
    } catch (err) {
      // The form above already refuses everything the backend refuses, so a
      // rejection here is unexpected. A plain-string reason from the server is
      // still shown if there is one; a FastAPI validation list is not, and
      // falls back to the generic message.
      showError(
        getApiErrorDetail(err, "Couldn't save the market rate. Please try again."),
      );
    }
  }

  async function handleRemove() {
    if (!canRemove) return;
    try {
      await remove(serviceType).unwrap();
      showSuccess("Market rate removed.");
      onSaved();
    } catch (err) {
      showError(
        getApiErrorDetail(err, "Couldn't remove the market rate. Please try again."),
      );
    }
  }

  return {
    isFlat,
    figure,
    setFigure,
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
    maxObservedOn: localToday(),
    handleSubmit,
    handleRemove,
  };
}
