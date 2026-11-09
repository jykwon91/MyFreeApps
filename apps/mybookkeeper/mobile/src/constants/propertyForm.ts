import type { PropertyType } from "@mybookkeeper/api-client/types/property/PropertyType";

export const PROPERTY_FORM_MESSAGES = {
  newTitle: "New property",
  editTitle: "Edit property",
  name: "Property name",
  namePlaceholder: "e.g. Beach House Unit A",
  street: "Street address",
  streetPlaceholder: "e.g. 6738 Peerless St",
  city: "City",
  state: "State",
  statePlaceholder: "TX",
  zip: "ZIP",
  classification: "Classification",
  chooseClassification: "How do you use it?",
  classificationWhy: "This decides which tax form its expenses go on.",
  rentalType: "Rental type",
  rentalTypeLabel: "Short-term or long-term rental",
  add: "Add property",
  adding: "Adding…",
  save: "Save changes",
  saving: "Saving…",
  added: "Property added.",
  saved: "Changes saved.",
} as const;

export const PROPERTY_TYPE_SEGMENTS: readonly { value: PropertyType; label: string }[] = [
  { value: "short_term", label: "Short-term" },
  { value: "long_term", label: "Long-term" },
];
