import type { MarketRateFormValues } from "./market-rate-form-values";

/** The message to show beside each market-rate field the backend would refuse. */
export type MarketRateFormProblems = Partial<Record<keyof MarketRateFormValues, string>>;
