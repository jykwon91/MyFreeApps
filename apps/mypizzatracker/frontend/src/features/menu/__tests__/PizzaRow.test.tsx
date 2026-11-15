import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PizzaRow from "../PizzaRow";
import type { PizzaType } from "@/types/menu/menu";

vi.mock("@/store/menuApi", () => ({
  useUpdatePizzaMutation: () => [vi.fn(), { isLoading: false }],
  useDeletePizzaMutation: () => [vi.fn(), { isLoading: false }],
}));

const pizza: PizzaType = {
  id: "p1",
  name: "Margherita",
  price: "12.00",
  description: "Basil",
  active: true,
  created_at: "",
  updated_at: "",
};

function nameInput() {
  return screen.getByLabelText("Name") as HTMLInputElement;
}

describe("PizzaRow editor", () => {
  it("reopens with the new values after the pizza changes", () => {
    const { rerender } = render(<PizzaRow pizza={pizza} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.click(screen.getByLabelText("Cancel"));

    rerender(<PizzaRow pizza={{ ...pizza, name: "Margherita DOP", price: "13.50" }} />);
    fireEvent.click(screen.getByLabelText("Edit"));

    expect(nameInput().value).toBe("Margherita DOP");
    expect((screen.getByLabelText("Price") as HTMLInputElement).value).toBe("13.50");
  });

  it("drops a cancelled half-typed edit", () => {
    render(<PizzaRow pizza={pizza} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.change(nameInput(), { target: { value: "abandoned" } });
    fireEvent.click(screen.getByLabelText("Cancel"));
    fireEvent.click(screen.getByLabelText("Edit"));

    expect(nameInput().value).toBe("Margherita");
  });
});
