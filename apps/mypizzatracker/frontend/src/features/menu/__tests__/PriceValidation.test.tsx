import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AddPizzaRow from "../AddPizzaRow";
import PizzaRowEditor from "../PizzaRowEditor";
import ToppingRowEditor from "../ToppingRowEditor";
import { MENU_PRICE_ERRORS } from "@/constants/menuPrice";
import type { PizzaType, ToppingType } from "@/types/menu/menu";

vi.mock("@/store/menuApi", () => ({
  useCreatePizzaMutation: () => [vi.fn(), { isLoading: false }],
  useUpdatePizzaMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateToppingMutation: () => [vi.fn(), { isLoading: false }],
}));

const pizza: PizzaType = {
  id: "p1", name: "Margherita", price: "12.00", description: null, active: true, created_at: "", updated_at: "",
};
const topping: ToppingType = {
  id: "t1", name: "Basil", price_delta: "0.00", active: true, created_at: "", updated_at: "",
};

function setPrice(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("menu price validation", () => {
  it.each([
    ["", MENU_PRICE_ERRORS.required],
    ["-1", MENU_PRICE_ERRORS.negative],
    ["12.345", MENU_PRICE_ERRORS.decimals],
  ])("AddPizzaRow disables Add and explains %j", (value, message) => {
    render(<AddPizzaRow onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Calabrese" } });
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
    setPrice(/^Price/, value);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
  });

  it("PizzaRowEditor disables Save on a cleared price and re-enables on a valid one", () => {
    render(<PizzaRowEditor pizza={pizza} onClose={vi.fn()} />);
    setPrice("Price", "");
    expect(screen.getByLabelText("Save")).toBeDisabled();
    setPrice("Price", "13.50");
    expect(screen.getByLabelText("Save")).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ToppingRowEditor disables Save on more than 2 decimals but allows a free topping", () => {
    render(<ToppingRowEditor topping={topping} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Save")).toBeEnabled();
    setPrice("Price delta", "0.125");
    expect(screen.getByLabelText("Save")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(MENU_PRICE_ERRORS.decimals);
  });
});
