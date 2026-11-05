import type { PropertyClassification } from "../types/property/PropertyClassification";
import type { PropertyType } from "../types/property/PropertyType";

export const CLASSIFICATION_LABELS: Record<PropertyClassification, string> = {
  investment: "Investment Property",
  primary_residence: "Primary Residence",
  second_home: "Second Home",
  unclassified: "Needs Classification",
};

export const TYPE_LABELS: Record<PropertyType, string> = {
  short_term: "Short-Term Rental",
  long_term: "Long-Term Rental",
};
