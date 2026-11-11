import type { CompanyResearch } from "../types/company-research";

/** The synthesis's compensation signals as text, or null when it has none (missing, falsy or only spaces). */
export function researchCompensationSignals(research: CompanyResearch): string | null {
  const signals = research.raw_synthesis?.compensation_signals;
  if (!signals) return null;
  const text = String(signals);
  return text.trim() === "" ? null : text;
}
