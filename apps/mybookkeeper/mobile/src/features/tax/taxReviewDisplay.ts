import type { FormCompleteness } from "@mybookkeeper/api-client/types/tax/FormCompleteness";
import { compareFormTypes } from "@mybookkeeper/api-client/utils/compareFormTypes";
import { getFormLabel } from "@mybookkeeper/api-client/utils/taxFormLabel";

const SCHEDULES_FIRST: readonly string[] = ["schedule_e", "schedule_c"];

function scheduleRank(formName: string): number {
  const rank = SCHEDULES_FIRST.indexOf(formName);
  return rank === -1 ? SCHEDULES_FIRST.length : rank;
}

/** Rental and business schedules first, properties in address order, then the rest in tax order. */
export function reviewFormOrder(forms: readonly FormCompleteness[]): FormCompleteness[] {
  return [...forms].sort(
    (a, b) =>
      scheduleRank(a.form_name) - scheduleRank(b.form_name) ||
      compareFormTypes(a.form_name, b.form_name) ||
      (a.instance_label ?? "").localeCompare(b.instance_label ?? ""),
  );
}

export function reviewFormTitle({ form_name, instance_label }: FormCompleteness): string {
  const label = getFormLabel(form_name);
  // Recalculated forms are labelled with their own name, like "FORM 1040".
  const isOwnName = instance_label?.toLowerCase() === label.toLowerCase();
  return instance_label && !isOwnName ? `${label} · ${instance_label}` : label;
}
