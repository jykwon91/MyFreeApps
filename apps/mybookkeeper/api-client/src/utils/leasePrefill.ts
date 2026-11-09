import { PREFILL_PROVENANCE_LABELS } from "../constants/leaseLabels";
import type { SignedLeaseTemplatePrefillItem } from "../types/lease/signed-lease-template-prefill";
import type { LeasePrefillProblem } from "../types/lease/lease-prefill-problem";
import { isReadableLeaseNumber } from "./leasePlaceholderValue";

export const SAVED_ON_LEASE_LABEL = "saved on lease";

/** A value already saved on the lease wins over where a fresh one would have come from. */
export function prefillProvenanceLabel(item: SignedLeaseTemplatePrefillItem): string | null {
  if (item.is_from_existing_values) return SAVED_ON_LEASE_LABEL;
  if (!item.provenance) return null;
  return PREFILL_PROVENANCE_LABELS[item.provenance] ?? null;
}

/** A signature is signed on paper, so it is never asked for. */
export function prefillItemsToAsk(items: readonly SignedLeaseTemplatePrefillItem[]): SignedLeaseTemplatePrefillItem[] {
  return items.filter((item) => item.input_type !== "signature");
}

/** The labels of required fields still blank, in form order. */
export function missingPrefillLabels(items: readonly SignedLeaseTemplatePrefillItem[], values: Readonly<Record<string, string>>): string[] {
  return prefillItemsToAsk(items)
    .filter((item) => item.required && (values[item.key] ?? "").trim() === "")
    .map((item) => item.display_label);
}

/** What is wrong with each field, by key. A blank optional field is fine; a number that can't be read never is. */
export function prefillProblems(
  items: readonly SignedLeaseTemplatePrefillItem[],
  values: Readonly<Record<string, string>>,
): Record<string, LeasePrefillProblem> {
  const problems: Record<string, LeasePrefillProblem> = {};
  for (const item of prefillItemsToAsk(items)) {
    const value = (values[item.key] ?? "").trim();
    if (value === "") {
      if (item.required) problems[item.key] = "required";
    } else if (item.input_type === "number" && !isReadableLeaseNumber(value)) {
      problems[item.key] = "not_a_number";
    }
  }
  return problems;
}
