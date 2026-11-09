import { useState } from "react";
import { getApiErrorDetail } from "@/shared/lib/api-error-detail";
import { showError, showSuccess } from "@platform/ui";
import { localToday } from "@mybookkeeper/api-client/utils/localToday";
import {
  useDeleteMarketRateBenchmarkMutation,
  useUpsertMarketRateBenchmarkMutation,
} from "@mybookkeeper/api-client/store/marketRateBenchmarksApi";
import type { MarketRateBenchmark } from "@mybookkeeper/api-client/types/utility/market-rate-benchmark";
import {
  isFlatService,
  isMarketRateFigureValid,
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

  const isFigureValid = isMarketRateFigureValid(figure);
  const isBusy = isSaving || isRemoving;
  const canSubmit = isFigureValid && observedOn !== "" && !isBusy;
  const canRemove = existing !== undefined && !isBusy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await upsert({
        serviceType,
        data: toMarketRateUpsert(serviceType, { figure, source, observedOn, notes }),
      }).unwrap();
      showSuccess("Market rate saved.");
      onSaved();
    } catch (err) {
      // The backend says which rule the payload broke — "electricity is
      // metered, provide rate_cents_per_kwh", "at most 4 decimal places". A
      // generic "try again" would send the operator to retype a value that
      // will be rejected identically.
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
    maxObservedOn: localToday(),
    handleSubmit,
    handleRemove,
  };
}
