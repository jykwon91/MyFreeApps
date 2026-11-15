import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OrderBuilder from "../OrderBuilder";
import type { PublicCustomerLookup, PublicDrop, PublicMenu } from "@/types/public/public";

// What the lookup answers per phone; a phone not listed is a 404.
let customersByPhone: Record<string, PublicCustomerLookup>;
// Like RTK Query: `data` keeps the last success from an earlier phone, `currentData` is this phone's only.
let lastSuccess: PublicCustomerLookup | undefined;
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
    const current = skip ? undefined : customersByPhone[phone];
    if (current) lastSuccess = current;
    return { data: current ?? lastSuccess, currentData: current };
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
    customersByPhone = { "5125551234": jane, "5125559999": { ...jane, customer_name: "Ana" } };
    lastSuccess = undefined;
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
  it("keeps the applied state showing for the phone it was applied to", () => {
    const { phone } = renderBuilder();
    fireEvent.change(phone, { target: { value: "5125551234" } });
    fireEvent.click(screen.getByText("apply usual"));
    expect(screen.getByText("usual applied")).toBeInTheDocument();
    expect(lookupCalls[lookupCalls.length - 1]?.skip).toBe(false);
  });

  it("a different known phone gets its own banner, not the applied state", () => {
    const { name, phone } = renderBuilder();
    fireEvent.change(phone, { target: { value: "5125551234" } });
    fireEvent.click(screen.getByText("apply usual"));

    fireEvent.change(phone, { target: { value: "5125559999" } });
    expect(screen.getByText("apply usual")).toBeInTheDocument();
    expect(name.value).toBe("Ana");
  });

  it("drops the banner and the pre-filled name when the phone changes to an unknown one", () => {
    const { name, phone } = renderBuilder();
    fireEvent.change(phone, { target: { value: "5125551234" } });
    expect(screen.getByText("apply usual")).toBeInTheDocument();
    expect(name.value).toBe("Jane");

    fireEvent.change(phone, { target: { value: "5125550000" } });
    expect(screen.queryByText("apply usual")).toBeNull();
    expect(screen.queryByText("usual applied")).toBeNull();
    expect(name.value).toBe("");
  });

  it("drops the banner when the phone is cleared", () => {
    const { phone } = renderBuilder();
    fireEvent.change(phone, { target: { value: "5125551234" } });
    expect(screen.getByText("apply usual")).toBeInTheDocument();

    fireEvent.change(phone, { target: { value: "" } });
    expect(screen.queryByText("apply usual")).toBeNull();
  });

  it("hides the banner while the phone field is ahead of the debounce", () => {
    const { phone } = renderBuilder();
    fireEvent.change(phone, { target: { value: "5125551234" } });
    heldDebounce = "5125551234";
    fireEvent.change(phone, { target: { value: "512" } });
    expect(screen.queryByText("apply usual")).toBeNull();
  });

  it("keeps a name the customer typed when the phone changes to another customer", () => {
    const { name, phone } = renderBuilder();
    fireEvent.change(phone, { target: { value: "5125551234" } });
    fireEvent.change(name, { target: { value: "J. Doe" } });
    fireEvent.change(phone, { target: { value: "5125559999" } });
    expect(name.value).toBe("J. Doe");
  });
});
