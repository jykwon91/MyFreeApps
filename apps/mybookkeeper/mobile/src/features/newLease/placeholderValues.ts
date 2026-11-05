import type { MergedPlaceholder } from "@mybookkeeper/api-client/types/lease/merged-placeholder";
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

export function leaseValues(fields: readonly MergedPlaceholder[], edits: PlaceholderEdits): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.placeholder.key, placeholderValue(field, edits).trim()]));
}
