import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import PizzaRow from "../PizzaRow";
import type { PizzaType } from "@/types/menu/menu";

const { deletePizza, showError } = vi.hoisted(() => ({
  deletePizza: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError,
}));

vi.mock("@/store/menuApi", () => ({
  useUpdatePizzaMutation: () => [vi.fn(), { isLoading: false }],
  useDeletePizzaMutation: () => [deletePizza, { isLoading: false }],
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

describe("PizzaRow delete", () => {
  it("shows why a pizza in past orders can't be deleted and closes the dialog", async () => {
    const detail = "Margherita is in past orders, so it can't be deleted. Mark it unavailable (86 it) instead.";
    deletePizza.mockReturnValue({
      unwrap: () => Promise.reject({ status: 409, data: { detail } }),
    });
    render(<PizzaRow pizza={pizza} />);

    fireEvent.click(screen.getByLabelText("Delete"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(detail));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "86" })).toBeTruthy();
  });
});
