import {
  BENCHMARK_FORM_PROBLEMS,
  BENCHMARK_NOTES_MAX_LENGTH,
  BENCHMARK_SOURCE_MAX_LENGTH,
  MARKET_RATE_MAX_CENTS_PER_KWH,
  MARKET_RATE_MAX_DECIMALS,
  BENCHMARK_MONEY_MAX_DECIMALS,
} from "../constants/benchmarkForm";
import { NO_RATE, PER_MONTH_SUFFIX } from "../constants/rateDisplay";
import type { MarketRateBenchmark } from "../types/utility/market-rate-benchmark";
import type { MarketRateBenchmarkUpsertRequest } from "../types/utility/market-rate-benchmark-upsert-request";
import type { MarketRateFormProblems } from "../types/utility/market-rate-form-problems";
import type { MarketRateFormValues } from "../types/utility/market-rate-form-values";
import type { UtilityServiceType } from "../types/utility/utility-service-type";
import { decimalPlaces, isPlainNumber, isTooLong, observedOnProblem } from "./benchmarkFieldChecks";
import { localToday } from "@platform/core/utils/localToday";
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

function figureProblem(serviceType: UtilityServiceType, figure: string): string | undefined {
  const text = figure.trim();
  const flat = isFlatService(serviceType);
  const required = flat ? BENCHMARK_FORM_PROBLEMS.monthlyRequired : BENCHMARK_FORM_PROBLEMS.rateRequired;
  if (!isPlainNumber(text) || Number(text) <= 0) return required;
  if (flat) {
    if (decimalPlaces(text) > BENCHMARK_MONEY_MAX_DECIMALS) return BENCHMARK_FORM_PROBLEMS.moneyTooPrecise;
    const cents = Math.round(Number(text) * 100);
    if (cents <= 0) return required;
    return Number.isSafeInteger(cents) ? undefined : BENCHMARK_FORM_PROBLEMS.monthlyTooLarge;
  }
  if (decimalPlaces(text) > MARKET_RATE_MAX_DECIMALS) return BENCHMARK_FORM_PROBLEMS.rateTooPrecise;
  return Number(text) > MARKET_RATE_MAX_CENTS_PER_KWH ? BENCHMARK_FORM_PROBLEMS.rateTooHigh : undefined;
}

/**
 * Every rule the backend applies to a market-rate request, keyed by the field to point at.
 * Empty means the server has nothing to refuse, so a 422 after this is unexpected.
 */
export function marketRateFormProblems(serviceType: UtilityServiceType, values: MarketRateFormValues, today: string): MarketRateFormProblems {
  const problems: MarketRateFormProblems = {};
  const figure = figureProblem(serviceType, values.figure);
  if (figure) problems.figure = figure;
  if (isTooLong(values.source, BENCHMARK_SOURCE_MAX_LENGTH)) problems.source = BENCHMARK_FORM_PROBLEMS.sourceTooLong;
  const observedOn = observedOnProblem(values.observedOn, today);
  if (observedOn) problems.observedOn = observedOn;
  if (isTooLong(values.notes, BENCHMARK_NOTES_MAX_LENGTH)) problems.notes = BENCHMARK_FORM_PROBLEMS.notesTooLong;
  return problems;
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
