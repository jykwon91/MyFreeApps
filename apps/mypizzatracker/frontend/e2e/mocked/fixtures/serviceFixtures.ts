/** The service dashboard as GET /service/drops/{id} answers it (app/schemas/service/service_schemas.py). */
import type { DashboardOrder, DashboardSlot, ServiceDashboardPayload } from "@/types/service/service";
import { DROP_DATE, FIXTURE_NOW } from "../constants/fixtureTimes";
import { ACTIVE_DROP_ID, activeDrop } from "./dropFixtures";
import { customerIdAt, orderIdAt, orderPizzaIdAt, pizzaIdAt, toppingIdAt } from "./fixtureIds";

export const FIRST_ORDER_ID = orderIdAt(1);

function firstOrder(slotId: string): DashboardOrder {
  return {
    id: FIRST_ORDER_ID,
    slot_id: slotId,
    status: "not_started",
    payment_method_tag: "venmo",
    payment_status: "unpaid",
    ready_text_sent_at: null,
    created_at: FIXTURE_NOW,
    updated_at: FIXTURE_NOW,
    customer: { id: customerIdAt(1), name: "Ana Lopez", phone: "5125550101" },
    pizzas: [
      {
        id: orderPizzaIdAt(1),
        pizza_type_id: pizzaIdAt(1),
        name: "Margherita",
        modifications_text: "extra crispy",
        is_free: false,
        price_snapshot: "12.00",
        toppings: [{ topping_type_id: toppingIdAt(2), name: "Mushrooms", price_delta_snapshot: "1.50" }],
      },
    ],
    total: "13.50",
    pizza_count: 1,
  };
}

/** The active drop's four slots, the first holding one order. */
export function sampleDashboard(): ServiceDashboardPayload {
  const drop = activeDrop();
  const slots: DashboardSlot[] = drop.slots.map((slot, index) => {
    const orders = index === 0 ? [firstOrder(slot.id)] : [];
    const pizzaCount = orders.reduce((sum, order) => sum + order.pizza_count, 0);
    return {
      id: slot.id,
      pickup_time: slot.pickup_time,
      max_pizzas: slot.max_pizzas,
      pizza_count: pizzaCount,
      remaining_capacity: slot.max_pizzas - pizzaCount,
      orders,
    };
  });
  return {
    drop: {
      id: ACTIVE_DROP_ID,
      name: drop.name,
      date: DROP_DATE,
      status: "active",
      slot_window_start: drop.slot_window_start,
      slot_window_end: drop.slot_window_end,
      in_progress_count: 1,
    },
    slots,
    server_time: FIXTURE_NOW,
  };
}
