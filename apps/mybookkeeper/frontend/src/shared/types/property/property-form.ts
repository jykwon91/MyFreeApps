import type { PropertyClassification } from "./property-classification";
import type { PropertyType } from "./property-type";
import type { AddressFields } from "./address-fields";

export interface PropertyForm extends AddressFields {
  name: string;
  classification: PropertyClassification;
  type: PropertyType | null;
}
