import type { MergedPlaceholder } from "@mybookkeeper/api-client/types/lease/merged-placeholder";
import { placeholderNumberUnreadable } from "@mybookkeeper/api-client/utils/leasePlaceholders";
import type { PlaceholderEdits } from "../../types/PlaceholderEdits";

export function placeholderValue(field: MergedPlaceholder, edits: PlaceholderEdits): string {
  return edits[field.placeholder.key] ?? field.value ?? "";
}

export function hasChanges(fields: readonly MergedPlaceholder[], edits: PlaceholderEdits): boolean {
  return fields.some((field) => placeholderValue(field, edits) !== (field.value ?? ""));
}

export function missingRequired(fields: readonly MergedPlaceholder[], edits: PlaceholderEdits): MergedPlaceholder[] {
  return fields.filter((field) => field.placeholder.required && !placeholderValue(field, edits).trim());
}

/** A number typed in that can't be read: sent as it is, the lease would print something nobody meant. */
export function unreadableNumbers(fields: readonly MergedPlaceholder[], edits: PlaceholderEdits): MergedPlaceholder[] {
  return fields.filter((field) => placeholderNumberUnreadable(field.placeholder, placeholderValue(field, edits)));
}

export function leaseValues(fields: readonly MergedPlaceholder[], edits: PlaceholderEdits): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.placeholder.key, placeholderValue(field, edits).trim()]));
}
