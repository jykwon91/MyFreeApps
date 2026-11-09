import type { UtilityServiceType } from "../types/utility/utility-service-type";

export const UTILITY_SERVICE_TYPES: readonly UtilityServiceType[] = [
  "electricity",
  "natural_gas",
  "water",
  "internet",
];

export const UTILITY_SERVICE_TYPE_LABELS: Record<UtilityServiceType, string> = {
  electricity: "Electricity",
  natural_gas: "Natural gas",
  water: "Water",
  internet: "Internet",
};
