import type { SignedLeaseTemplatePrefillItem } from "@mybookkeeper/api-client/types/lease/signed-lease-template-prefill";
import type { PlaceholderEdits } from "@mybookkeeper/api-client/types/lease/placeholder-edits";

export function documentValue(item: SignedLeaseTemplatePrefillItem, edits: PlaceholderEdits): string {
  return edits[item.key] ?? item.value;
}

export function documentValuesChanged(items: readonly SignedLeaseTemplatePrefillItem[], edits: PlaceholderEdits): boolean {
  return items.some((item) => documentValue(item, edits) !== item.value);
}

/** Every value by key, as the website sends them. */
export function documentValues(items: readonly SignedLeaseTemplatePrefillItem[], edits: PlaceholderEdits): Record<string, string> {
  return Object.fromEntries(items.map((item) => [item.key, documentValue(item, edits).trim()]));
}
