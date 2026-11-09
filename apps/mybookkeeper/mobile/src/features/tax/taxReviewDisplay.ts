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

function isSameCopyGroup(a: FormCompleteness, b: FormCompleteness): boolean {
  return a.form_name === b.form_name && (a.instance_label ?? "") === (b.instance_label ?? "");
}

/**
 * Which of several same-named, same-labelled copies a form is, counting from 0 in list order.
 * The review carries no id for a copy, so this is what tells two unlabeled copies apart.
 */
export function reviewCopyNumber(ordered: readonly FormCompleteness[], form: FormCompleteness): number {
  return ordered.slice(0, ordered.indexOf(form)).filter((earlier) => isSameCopyGroup(earlier, form)).length;
}

/** The copy of a form a list row pointed at, found again in a fresh review. */
export function findReviewForm(forms: readonly FormCompleteness[], formName: string, label: string, copy: number): FormCompleteness | undefined {
  const target = { form_name: formName, instance_label: label } as FormCompleteness;
  return reviewFormOrder(forms).filter((candidate) => isSameCopyGroup(candidate, target))[copy];
}
