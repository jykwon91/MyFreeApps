import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ToppingRow from "../ToppingRow";
import type { ToppingType } from "@/types/menu/menu";

vi.mock("@/store/menuApi", () => ({
  useUpdateToppingMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteToppingMutation: () => [vi.fn(), { isLoading: false }],
}));

const topping: ToppingType = {
  id: "t1",
  name: "Basil",
  price_delta: "0.00",
  active: true,
  created_at: "",
  updated_at: "",
};

function nameInput() {
  return screen.getByLabelText("Name") as HTMLInputElement;
}

describe("ToppingRow editor", () => {
  it("reopens with the new values after the topping changes", () => {
    const { rerender } = render(<ToppingRow topping={topping} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.click(screen.getByLabelText("Cancel"));

    rerender(<ToppingRow topping={{ ...topping, name: "Fresh basil", price_delta: "0.75" }} />);
    fireEvent.click(screen.getByLabelText("Edit"));

    expect(nameInput().value).toBe("Fresh basil");
    expect((screen.getByLabelText("Price delta") as HTMLInputElement).value).toBe("0.75");
  });

  it("drops a cancelled half-typed edit", () => {
    render(<ToppingRow topping={topping} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.change(nameInput(), { target: { value: "abandoned" } });
    fireEvent.click(screen.getByLabelText("Cancel"));
    fireEvent.click(screen.getByLabelText("Edit"));

    expect(nameInput().value).toBe("Basil");
  });
});
