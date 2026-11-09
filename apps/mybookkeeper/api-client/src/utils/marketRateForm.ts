import { NO_RATE, PER_MONTH_SUFFIX } from "../constants/rateDisplay";
import type { MarketRateBenchmark } from "../types/utility/market-rate-benchmark";
import type { MarketRateBenchmarkUpsertRequest } from "../types/utility/market-rate-benchmark-upsert-request";
import type { MarketRateFormValues } from "../types/utility/market-rate-form-values";
import type { UtilityServiceType } from "../types/utility/utility-service-type";
import { localToday } from "./localToday";
import { formatCents, formatCentsPerKwh } from "./utilityPlanFormat";

/** Internet is quoted per month; every other service per kWh. The service decides, never the operator. */
export function isFlatService(serviceType: UtilityServiceType): boolean {
  return serviceType === "internet";
}

/**
 * Read from the column the service type is priced in, not from whichever one is populated:
 * the comparison picks its figure the same way, and two sides disagreeing about the unit is
 * how a monthly amount ends up shown as a per-kWh rate.
 */
export function describeBenchmarkFigure(benchmark: MarketRateBenchmark): string {
  if (isFlatService(benchmark.service_type)) {
    return benchmark.monthly_cents === null ? NO_RATE : `${formatCents(benchmark.monthly_cents)}${PER_MONTH_SUFFIX}`;
  }
  return formatCentsPerKwh(benchmark.rate_cents_per_kwh);
}

export function marketRateToFormValues(serviceType: UtilityServiceType, existing: MarketRateBenchmark | undefined): MarketRateFormValues {
  const flat = isFlatService(serviceType);
  const figure = !existing
    ? ""
    : flat
      ? existing.monthly_cents === null
        ? ""
        : (existing.monthly_cents / 100).toFixed(2)
      : (existing.rate_cents_per_kwh ?? "");
  return { figure, source: existing?.source ?? "", observedOn: existing?.observed_on ?? localToday(), notes: existing?.notes ?? "" };
}

export function isMarketRateFigureValid(figure: string): boolean {
  const parsed = Number(figure);
  return figure.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
}

/** Exactly one figure is sent, so the backend's "provide exactly one" rule holds. */
export function toMarketRateUpsert(serviceType: UtilityServiceType, values: MarketRateFormValues): Omit<MarketRateBenchmarkUpsertRequest, "today"> {
  const source = values.source.trim();
  const notes = values.notes.trim();
  return {
    ...(isFlatService(serviceType) ? { monthly_cents: Math.round(Number(values.figure) * 100) } : { rate_cents_per_kwh: values.figure.trim() }),
    source: source === "" ? null : source,
    observed_on: values.observedOn,
    notes: notes === "" ? null : notes,
  };
}
