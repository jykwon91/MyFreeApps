/**
 * Menu types -- mirrors backend schemas at
 * apps/mypizzatracker/backend/app/schemas/menu/menu_schemas.py
 *
 * Decimals (price, price_delta) are serialized as strings to preserve
 * precision over JSON. Use the helpers in `lib/money.ts` (later) for
 * comparisons; for now plain string equality / parseFloat is sufficient.
 */

export interface PizzaType {
  id: string;
  name: string;
  price: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PizzaTypeCreateBody {
  name: string;
  price: string;
  description?: string | null;
  active?: boolean;
}

export interface PizzaTypeUpdateBody {
  name?: string;
  price?: string;
  description?: string | null;
  active?: boolean;
}

export interface ToppingType {
  id: string;
  name: string;
  price_delta: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ToppingTypeCreateBody {
  name: string;
  price_delta?: string;
  active?: boolean;
}

export interface ToppingTypeUpdateBody {
  name?: string;
  price_delta?: string;
  active?: boolean;
}

export interface Menu {
  pizzas: PizzaType[];
  toppings: ToppingType[];
}
