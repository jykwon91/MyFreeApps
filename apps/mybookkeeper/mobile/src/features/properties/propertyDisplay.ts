import { CLASSIFICATION_LABELS, TYPE_LABELS } from "@mybookkeeper/api-client/constants/propertyLabels";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import { PROPERTY_MESSAGES } from "../../constants/properties";

export function needsClassification(property: Property): boolean {
  return property.classification === "unclassified";
}

/** Null for a property still waiting on a classification, which its chip already says. */
export function propertyUse(property: Property): string | null {
  if (needsClassification(property)) return null;
  const classification = CLASSIFICATION_LABELS[property.classification];
  return property.type ? `${classification} · ${TYPE_LABELS[property.type]}` : classification;
}

export function propertySpokenLabel(property: Property): string {
  return [
    property.name,
    property.address,
    propertyUse(property),
    property.is_active ? null : PROPERTY_MESSAGES.inactive,
    needsClassification(property) ? PROPERTY_MESSAGES.needsClassification : null,
  ]
    .filter(Boolean)
    .join(", ");
}

export function classifyPrompt(count: number): string {
  return count === 1 ? "1 property needs classifying." : `${count} properties need classifying.`;
}
