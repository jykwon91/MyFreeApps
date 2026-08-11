import { useState } from "react";
import { getApiErrorDetail } from "@/shared/lib/api-error-detail";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useDeleteMarketRateBenchmarkMutation,
  useUpsertMarketRateBenchmarkMutation,
} from "@/shared/store/marketRateBenchmarksApi";
import type { MarketRateBenchmark } from "@/shared/types/utility/market-rate-benchmark";
import type { UtilityServiceType } from "@/shared/types/utility/utility-service-type";

interface UseMarketRateBenchmarkFormArgs {
  serviceType: UtilityServiceType;
  existing: MarketRateBenchmark | undefined;
  onSaved: () => void;
}

/** Today as ``YYYY-MM-DD`` in local time — ``toISOString`` would shift the date. */
function todayLocalIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
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
  const isFlat = serviceType === "internet";

  const [figure, setFigure] = useState(() => {
    if (!existing) return "";
    if (isFlat) {
      return existing.monthly_cents === null
        ? ""
        : (existing.monthly_cents / 100).toFixed(2);
    }
    return existing.rate_cents_per_kwh ?? "";
  });
  const [source, setSource] = useState(existing?.source ?? "");
  const [observedOn, setObservedOn] = useState(existing?.observed_on ?? todayLocalIso());
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const [upsert, { isLoading: isSaving }] = useUpsertMarketRateBenchmarkMutation();
  const [remove, { isLoading: isRemoving }] = useDeleteMarketRateBenchmarkMutation();

  const parsedFigure = Number(figure);
  const isFigureValid = figure.trim() !== "" && Number.isFinite(parsedFigure) && parsedFigure > 0;
  const isBusy = isSaving || isRemoving;
  const canSubmit = isFigureValid && observedOn !== "" && !isBusy;
  const canRemove = existing !== undefined && !isBusy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await upsert({
        serviceType,
        data: {
          // Exactly one shape — the other stays absent so the backend's
          // "provide exactly one" rule is satisfied.
          ...(isFlat
            ? { monthly_cents: Math.round(parsedFigure * 100) }
            : { rate_cents_per_kwh: figure.trim() }),
          source: source.trim() === "" ? null : source.trim(),
          observed_on: observedOn,
          notes: notes.trim() === "" ? null : notes.trim(),
        },
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
    maxObservedOn: todayLocalIso(),
    handleSubmit,
    handleRemove,
  };
}
