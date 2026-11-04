import type { PropertyClassification } from "@mybookkeeper/api-client/types/property/PropertyClassification";
import type { PropertyType } from "@mybookkeeper/api-client/types/property/PropertyType";
import type { AddressFields } from "./address-fields";

export interface PropertyForm extends AddressFields {
  name: string;
  classification: PropertyClassification;
  type: PropertyType | null;
}
