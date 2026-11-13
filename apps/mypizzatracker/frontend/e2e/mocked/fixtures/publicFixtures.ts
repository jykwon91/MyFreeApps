/** The customer pages' reads, as the /public routes answer them (app/schemas/public/public_schemas.py). */
import type {
  PublicDrop,
  PublicMenu,
  PublicOrderConfirmation,
  PublicOrderCreateBody,
} from "@/types/public/public";
import { DROP_DATE, FIXTURE_NOW } from "../constants/fixtureTimes";
import { ACTIVE_DROP_ID, sampleDrops } from "./dropFixtures";
import { sampleMenu } from "./menuFixtures";

/** Only active rows reach the customer menu. */
export function samplePublicMenu(): PublicMenu {
  const menu = sampleMenu();
  return {
    pizzas: menu.pizzas.filter((p) => p.active).map(({ id, name, price, description }) => ({ id, name, price, description })),
    toppings: menu.toppings.filter((t) => t.active).map(({ id, name, price_delta }) => ({ id, name, price_delta })),
  };
}

/** The active drop with its slots' remaining room; the last slot is full. */
export function samplePublicDrop(): PublicDrop {
  const drop = sampleDrops()[0];
  const lastIndex = drop.slots.length - 1;
  return {
    id: ACTIVE_DROP_ID,
    name: drop.name,
    date: DROP_DATE,
    slot_window_start: drop.slot_window_start,
    slot_window_end: drop.slot_window_end,
    slots: drop.slots.map((slot, index) => ({
      id: slot.id,
      pickup_time: slot.pickup_time,
      max_pizzas: slot.max_pizzas,
      remaining_pizzas: index === lastIndex ? 0 : slot.max_pizzas - 1,
    })),
  };
}

/** What POST /public/orders answers for `body`, priced from the menu like the order service does. */
export function confirmationFromOrder(orderId: string, body: PublicOrderCreateBody): PublicOrderConfirmation {
  const menu = samplePublicMenu();
  const drop = samplePublicDrop();
  const slot = drop.slots.find((s) => s.id === body.slot_id);
  if (!slot) throw new Error(`no slot ${body.slot_id} in the public drop`);
  const pizzas = body.pizzas.map((line) => {
    const pizza = menu.pizzas.find((p) => p.id === line.pizza_type_id);
    if (!pizza) throw new Error(`no pizza ${line.pizza_type_id} on the public menu`);
    const toppings = menu.toppings.filter((t) => line.topping_type_ids.includes(t.id));
    const toppingsTotal = toppings.reduce((sum, t) => sum + Number(t.price_delta), 0);
    return {
      pizza_name: pizza.name,
      pizza_price: pizza.price,
      toppings: toppings.map((t) => t.name),
      toppings_price_delta_total: toppingsTotal.toFixed(2),
      modifications_text: line.modifications_text ?? null,
      line_total: (Number(pizza.price) + toppingsTotal).toFixed(2),
    };
  });
  return {
    order_id: orderId,
    drop_name: drop.name,
    drop_date: drop.date,
    slot_pickup_time: slot.pickup_time,
    customer_name: body.customer_name,
    customer_phone: body.customer_phone,
    payment_method_tag: body.payment_method_tag,
    payment_status: "unpaid",
    status: "not_started",
    pizzas,
    total: pizzas.reduce((sum, p) => sum + Number(p.line_total), 0).toFixed(2),
    created_at: FIXTURE_NOW,
  };
}
