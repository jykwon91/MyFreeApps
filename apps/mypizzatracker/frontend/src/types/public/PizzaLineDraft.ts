/**
 * Local state for a single pizza line under construction. Differs from the
 * wire shape in that toppings live as a Set for cheap toggle/duplicate
 * detection; we serialize back to an array at submit time.
 */
export interface PizzaLineDraft {
  /** Unique local id for React keys + remove. NOT the pizza_type_id. */
  localId: string;
  pizza_type_id: string;
  topping_type_ids: Set<string>;
  modifications_text: string;
}
