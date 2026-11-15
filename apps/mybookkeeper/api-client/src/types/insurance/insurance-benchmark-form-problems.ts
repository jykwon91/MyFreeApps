import type { InsuranceBenchmarkFormValues } from "./insurance-benchmark-form-values";

/** The message to show beside each market-premium field the backend would refuse. */
export type InsuranceBenchmarkFormProblems = Partial<Record<keyof InsuranceBenchmarkFormValues, string>>;
