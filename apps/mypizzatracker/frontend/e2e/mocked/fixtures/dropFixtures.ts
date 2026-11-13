/** Drops as GET /drops answers them (DropRead, app/schemas/drop/drop_schemas.py). */
import type { Drop, DropCreateBody, Slot, SlotCreateBody } from "@/types/drop/drop";
import { DROP_DATE, FIXTURE_NOW } from "../constants/fixtureTimes";
import { dropIdAt, slotIdAt } from "./fixtureIds";

export const ACTIVE_DROP_ID = dropIdAt(1);
export const PLANNING_DROP_ID = dropIdAt(2);
export const CLOSED_DROP_ID = dropIdAt(3);

export function slotOf(dropId: string, n: number, pickupTime: string, maxPizzas: number): Slot {
  return { id: slotIdAt(n), drop_id: dropId, pickup_time: pickupTime, max_pizzas: maxPizzas };
}

export function dropOf(id: string, fields: Partial<Drop> = {}): Drop {
  return {
    id,
    date: DROP_DATE,
    name: "Friday Night Drop",
    slot_window_start: "17:00:00",
    slot_window_end: "20:00:00",
    status: "planning",
    tip_total: "0.00",
    created_at: FIXTURE_NOW,
    updated_at: FIXTURE_NOW,
    slots: [],
    ...fields,
  };
}

/** What POST /drops answers for `body`: a new planning drop with no slots. */
export function dropFromCreate(id: string, body: DropCreateBody): Drop {
  return dropOf(id, { ...body, status: "planning", slots: [] });
}

/** What POST /drops/{id}/slots answers for `body`. */
export function slotFromCreate(dropId: string, n: number, body: SlotCreateBody): Slot {
  return slotOf(dropId, n, body.pickup_time, body.max_pizzas);
}

/** Drops in GET /drops order: newest date first, then newest created (drop_repo.list_drops). */
export function newestFirst(drops: Drop[]): Drop[] {
  return [...drops].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
}

/** The active drop, wherever it falls in the list. */
export function activeDrop(drops: Drop[] = sampleDrops()): Drop {
  const drop = drops.find((d) => d.id === ACTIVE_DROP_ID);
  if (!drop) throw new Error("no active drop in the fixtures");
  return drop;
}

/** One drop of each status, so each card's actions differ, newest first. */
export function sampleDrops(): Drop[] {
  return newestFirst([
    dropOf(ACTIVE_DROP_ID, {
      status: "active",
      tip_total: "15.00",
      slots: [
        slotOf(ACTIVE_DROP_ID, 1, "17:00:00", 6),
        slotOf(ACTIVE_DROP_ID, 2, "17:30:00", 6),
        slotOf(ACTIVE_DROP_ID, 3, "18:00:00", 6),
        slotOf(ACTIVE_DROP_ID, 4, "18:30:00", 4),
      ],
    }),
    dropOf(PLANNING_DROP_ID, { name: "Holiday Drop", date: "2026-12-24", slots: [] }),
    dropOf(CLOSED_DROP_ID, {
      name: "Opening Night",
      date: "2026-10-31",
      status: "closed",
      tip_total: "35.00",
      slots: [slotOf(CLOSED_DROP_ID, 9, "18:00:00", 8)],
    }),
  ]);
}
