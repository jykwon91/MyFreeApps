import type { PropertyClassification } from "./PropertyClassification";
import type { PropertyType } from "./PropertyType";

/** The body of a create or change of a property. */
export interface PropertyWrite {
  name: string;
  address: string;
  classification: PropertyClassification;
  type?: PropertyType;
}
