import type { AddressFields } from "./AddressFields";
import type { PropertyClassification } from "./PropertyClassification";
import type { PropertyType } from "./PropertyType";

export interface PropertyForm extends AddressFields {
  name: string;
  classification: PropertyClassification;
  type: PropertyType | null;
}
