import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SlotRow from "../SlotRow";
import type { Slot } from "@/types/drop/drop";

const { deleteSlot, showError } = vi.hoisted(() => ({
  deleteSlot: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError,
}));

vi.mock("@/store/dropsApi", () => ({
  useDeleteSlotMutation: () => [deleteSlot, { isLoading: false }],
}));

const slot: Slot = {
  id: "s1",
  drop_id: "d1",
  pickup_time: "12:00:00",
  max_pizzas: 6,
};

describe("SlotRow remove", () => {
  it("shows why a slot with orders can't be removed", async () => {
    const detail =
      "The 12:00 slot has orders, so it can't be removed. Move those orders to another slot first.";
    deleteSlot.mockReturnValue({
      unwrap: () => Promise.reject({ status: 409, data: { detail } }),
    });
    render(
      <ul>
        <SlotRow dropId="d1" slot={slot} editable />
      </ul>,
    );

    fireEvent.click(screen.getByLabelText("Remove slot"));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(detail));
    expect(deleteSlot).toHaveBeenCalledWith({ dropId: "d1", slotId: "s1" });
  });
});
