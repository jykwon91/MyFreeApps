import type { ActivityPeriod } from "./ActivityPeriod";
import type { PropertyClassification } from "./PropertyClassification";
import type { PropertyType } from "./PropertyType";

export interface Property {
  id: string;
  name: string;
  address: string | null;
  classification: PropertyClassification;
  type: PropertyType | null;
  is_active: boolean;
  /** Decimal string, e.g. "250000.00"; null when not entered. */
  purchase_price?: string | null;
  activity_periods: ActivityPeriod[];
  created_at: string;
}
