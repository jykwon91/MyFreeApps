import type { TileOption } from "@/shared/components/ui/TilePicker";
import type { PropertyClassification } from "@/shared/types/property/property-classification";
import type { PropertyType } from "@/shared/types/property/property-type";

export const CLASSIFICATION_LABELS: Record<PropertyClassification, string> = {
  investment: "Investment Property",
  primary_residence: "Primary Residence",
  second_home: "Second Home",
  unclassified: "Needs Classification",
};

export const CLASSIFICATION_OPTIONS: TileOption[] = [
  { value: "investment", label: "Investment Property", description: "Rental property — expenses deducted on Schedule E" },
  { value: "primary_residence", label: "Primary Residence", description: "Your main home — mortgage interest and taxes on Schedule A" },
  { value: "second_home", label: "Second Home", description: "Vacation home — mortgage interest and taxes on Schedule A" },
  { value: "unclassified", label: "Not Sure Yet", description: "I'll classify this later" },
];

export const TYPE_LABELS: Record<PropertyType, string> = {
  short_term: "Short-Term Rental",
  long_term: "Long-Term Rental",
};
