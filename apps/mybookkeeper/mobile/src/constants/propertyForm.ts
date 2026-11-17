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
  purchasePrice: "Purchase price",
  purchasePricePlaceholder: "e.g. 250000",
  purchasePriceHint: "A saved purchase price can be changed but not removed.",
  purchasePriceRemoved: "A saved purchase price can be changed but not removed.",
  purchasePriceInvalid: "Enter the price as a dollar amount, like 250000.",
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
