import type { MergedPlaceholder } from "../types/lease/merged-placeholder";
import type { PlaceholderEdits } from "../types/lease/placeholder-edits";
import type { PlaceholderProvenance } from "../types/lease/placeholder-provenance";
import { placeholderNumberUnreadable } from "./leasePlaceholders";

/** Edits are laid over the pulled values, so pulling again can never overwrite what was typed. */
export function placeholderValue(field: MergedPlaceholder, edits: PlaceholderEdits): string {
  return edits[field.placeholder.key] ?? field.value ?? "";
}

export function isEdited(field: MergedPlaceholder, edits: PlaceholderEdits): boolean {
  return placeholderValue(field, edits) !== (field.value ?? "");
}

/** Where the shown value came from: typing over a pulled value makes it "manual". */
export function placeholderProvenance(field: MergedPlaceholder, edits: PlaceholderEdits): PlaceholderProvenance {
  return isEdited(field, edits) ? "manual" : field.provenance;
}

export function hasChanges(fields: readonly MergedPlaceholder[], edits: PlaceholderEdits): boolean {
  return fields.some((field) => isEdited(field, edits));
}

export function missingRequired(fields: readonly MergedPlaceholder[], edits: PlaceholderEdits): MergedPlaceholder[] {
  return fields.filter((field) => field.placeholder.required && !placeholderValue(field, edits).trim());
}

/** A number typed in that can't be read: sent as it is, the lease would print something nobody meant. */
export function unreadableNumbers(fields: readonly MergedPlaceholder[], edits: PlaceholderEdits): MergedPlaceholder[] {
  return fields.filter((field) => placeholderNumberUnreadable(field.placeholder, placeholderValue(field, edits)));
}

/** Only the current fields are sent, so an edit to a field that is gone never reaches the server. */
export function leaseValues(fields: readonly MergedPlaceholder[], edits: PlaceholderEdits): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.placeholder.key, placeholderValue(field, edits).trim()]));
}
