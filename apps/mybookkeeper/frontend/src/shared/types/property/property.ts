import type { PropertyClassification } from "./property-classification";
import type { PropertyType } from "./property-type";

export interface ActivityPeriod {
  id: number;
  active_from: string;
  active_until: string;
}

export interface Property {
  id: string;
  name: string;
  address: string | null;
  classification: PropertyClassification;
  type: PropertyType | null;
  is_active: boolean;
  activity_periods: ActivityPeriod[];
  created_at: string;
}
