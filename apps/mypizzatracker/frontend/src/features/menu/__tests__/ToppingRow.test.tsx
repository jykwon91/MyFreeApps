import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ToppingRow from "../ToppingRow";
import type { ToppingType } from "@/types/menu/menu";

const { deleteTopping, showError } = vi.hoisted(() => ({
  deleteTopping: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError,
}));

vi.mock("@/store/menuApi", () => ({
  useUpdateToppingMutation: () => [vi.fn(), { isLoading: false }],
  useDeleteToppingMutation: () => [deleteTopping, { isLoading: false }],
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

describe("ToppingRow delete", () => {
  it("shows why a topping in past orders can't be deleted and closes the dialog", async () => {
    const detail = "Basil is in past orders, so it can't be deleted. Mark it unavailable (86 it) instead.";
    deleteTopping.mockReturnValue({
      unwrap: () => Promise.reject({ status: 409, data: { detail } }),
    });
    render(<ToppingRow topping={topping} />);

    fireEvent.click(screen.getByLabelText("Delete"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(detail));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "86" })).toBeTruthy();
  });
});
