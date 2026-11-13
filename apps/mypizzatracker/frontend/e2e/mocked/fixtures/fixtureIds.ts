/**
 * Fixture ids: valid UUIDs, one family per kind of record, so a failing
 * assertion shows at a glance which record it was about.
 */
const KIND = {
  drop: 1,
  slot: 2,
  pizza: 3,
  topping: 4,
  order: 5,
  customer: 6,
  expense: 7,
  orderPizza: 8,
} as const;

function idOf(kind: keyof typeof KIND, n: number): string {
  return `00000000-0000-4000-8${String(KIND[kind]).padStart(3, "0")}-${String(n).padStart(12, "0")}`;
}

export const dropIdAt = (n: number): string => idOf("drop", n);
export const slotIdAt = (n: number): string => idOf("slot", n);
export const pizzaIdAt = (n: number): string => idOf("pizza", n);
export const toppingIdAt = (n: number): string => idOf("topping", n);
export const orderIdAt = (n: number): string => idOf("order", n);
export const customerIdAt = (n: number): string => idOf("customer", n);
export const expenseIdAt = (n: number): string => idOf("expense", n);
export const orderPizzaIdAt = (n: number): string => idOf("orderPizza", n);
