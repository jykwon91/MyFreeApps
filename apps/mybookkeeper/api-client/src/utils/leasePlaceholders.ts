import type { LeaseTemplatePlaceholder } from "../types/lease/lease-template-placeholder";
import type { MergedPlaceholder } from "../types/lease/merged-placeholder";
import { isReadableLeaseNumber } from "./leasePlaceholderValue";

/** A signature is signed on paper and a computed value is worked out when the lease is made, so neither is typed in. */
export function isAskedPlaceholder(placeholder: LeaseTemplatePlaceholder): boolean {
  return placeholder.input_type !== "signature" && placeholder.input_type !== "computed";
}

export function askedFields(fields: readonly MergedPlaceholder[]): MergedPlaceholder[] {
  return fields.filter((field) => isAskedPlaceholder(field.placeholder));
}

export function computedFields(fields: readonly MergedPlaceholder[]): MergedPlaceholder[] {
  return fields.filter((field) => field.placeholder.input_type === "computed");
}

/** A typed number that can't be read, to flag on its own field. Blank is the required check's to judge. */
export function placeholderNumberUnreadable(placeholder: LeaseTemplatePlaceholder, value: string): boolean {
  const trimmed = value.trim();
  return placeholder.input_type === "number" && trimmed !== "" && !isReadableLeaseNumber(trimmed);
}
