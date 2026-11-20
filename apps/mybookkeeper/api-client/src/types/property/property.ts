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
  /** Decimal string; the part of the purchase price that's land, which isn't depreciated. */
  land_value?: string | null;
  /** ISO date (YYYY-MM-DD) the home was first ready to rent; depreciation starts here. */
  date_placed_in_service?: string | null;
  /** ISO date (YYYY-MM-DD) the home started collecting rent; null when not entered. */
  rented_since?: string | null;
  activity_periods: ActivityPeriod[];
  created_at: string;
}
