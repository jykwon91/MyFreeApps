import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TipEditor from "../TipEditor";

vi.mock("@/store/financialsApi", () => ({
  useUpdateTipMutation: () => [vi.fn(), { isLoading: false }],
}));

describe("TipEditor", () => {
  it("names the tip field once editing starts", () => {
    render(<TipEditor dropId="d1" current="12.50" readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("spinbutton", { name: "Tip total" })).toHaveValue(12.5);
  });
});
