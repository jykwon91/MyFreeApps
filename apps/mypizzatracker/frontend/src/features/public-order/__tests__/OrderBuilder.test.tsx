import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OrderBuilder from "../OrderBuilder";
import type { PublicCustomerLookup, PublicDrop, PublicMenu } from "@/types/public/public";

let lookupData: PublicCustomerLookup | undefined;
const lookupCalls: { phone: string; skip: boolean }[] = [];
// Set to hold the debounced phone at a value, as during the 400ms window.
let heldDebounce: string | undefined;

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  useDebouncedValue: <T,>(value: T) => (heldDebounce ?? value) as T,
}));

vi.mock("@/store/publicApi", () => ({
  useLookupPublicCustomerQuery: (phone: string, { skip }: { skip: boolean }) => {
    lookupCalls.push({ phone, skip });
    return { data: skip ? undefined : lookupData };
  },
  usePlacePublicOrderMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@/features/public-order/SlotPicker", () => ({ default: () => null }));
vi.mock("@/features/public-order/PizzaLineRow", () => ({ default: () => null }));
vi.mock("@/features/public-order/WelcomeBack", () => ({
  default: ({ applied, onApply }: { applied: boolean; onApply: () => void }) => (
    <button onClick={onApply}>{applied ? "usual applied" : "apply usual"}</button>
  ),
}));

const menu: PublicMenu = {
  pizzas: [{ id: "pz1" } as PublicMenu["pizzas"][number]],
  toppings: [],
};
const drop: PublicDrop = {
  id: "d1",
  name: "Friday",
  date: "2026-11-06",
  slot_window_start: "17:00:00",
  slot_window_end: "19:00:00",
  slots: [{ id: "s1", pickup_time: "17:30:00", max_pizzas: 10, remaining_pizzas: 10 }],
};
const jane: PublicCustomerLookup = {
  customer_name: "Jane",
  the_usual: [{ pizza_type_id: "pz1", topping_type_ids: [], modifications_text: null }],
};

function renderBuilder() {
  render(<OrderBuilder drop={drop} menu={menu} onPlaced={vi.fn()} />);
  return {
    name: screen.getByLabelText(/^Name/) as HTMLInputElement,
    phone: screen.getByLabelText(/^Phone/) as HTMLInputElement,
  };
}

describe("OrderBuilder returning-customer lookup", () => {
  beforeEach(() => {
    lookupData = jane;
    lookupCalls.length = 0;
    heldDebounce = undefined;
  });

  it("fills an empty name from the lookup, and doesn't refill it once cleared", () => {
    const { name, phone } = renderBuilder();
    fireEvent.change(phone, { target: { value: "5125551234" } });
    expect(name.value).toBe("Jane");

    fireEvent.change(name, { target: { value: "" } });
    expect(name.value).toBe("");
  });

  it("never overwrites a name the customer typed", () => {
    const { name, phone } = renderBuilder();
    fireEvent.change(name, { target: { value: "J. Doe" } });
    fireEvent.change(phone, { target: { value: "5125551234" } });
    expect(name.value).toBe("J. Doe");
  });

  it("clearing the phone after applying the usual unlocks the lookup again", () => {
    const { phone } = renderBuilder();
    fireEvent.change(phone, { target: { value: "5125551234" } });
    fireEvent.click(screen.getByText("apply usual"));
    expect(lookupCalls[lookupCalls.length - 1]?.skip).toBe(true);

    fireEvent.change(phone, { target: { value: "" } });
    fireEvent.change(phone, { target: { value: "5125559999" } });
    expect(lookupCalls[lookupCalls.length - 1]).toEqual({ phone: "5125559999", skip: false });
    expect(screen.getByText("apply usual")).toBeInTheDocument();
  });

  it("ignores apply when the phone was cut short, so the lookup isn't locked", () => {
    const { phone } = renderBuilder();
    fireEvent.change(phone, { target: { value: "5125551234" } });
    // The debounce hasn't caught up yet: the banner is still showing.
    heldDebounce = "5125551234";
    fireEvent.change(phone, { target: { value: "512" } });
    fireEvent.click(screen.getByText("apply usual"));
    heldDebounce = undefined;

    fireEvent.change(phone, { target: { value: "5125559999" } });
    expect(lookupCalls[lookupCalls.length - 1]).toEqual({ phone: "5125559999", skip: false });
  });
});
