/** A property's current value as the person entered it. */
export interface PropertyValue {
  property_id: string;
  estimated_value_cents: number | null;
  estimated_value_as_of: string | null;
}
