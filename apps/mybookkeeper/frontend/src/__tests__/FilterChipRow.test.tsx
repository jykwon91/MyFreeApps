import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterChipRow, { type FilterChipOption } from "@/shared/components/ui/FilterChipRow";

type Color = "red" | "blue";

const OPTIONS: ReadonlyArray<FilterChipOption<Color>> = [
  { value: null, label: "All" },
  { value: "red", label: "Red" },
  { value: "blue", label: "Blue" },
];

function renderRow(value: Color | null, onChange = vi.fn()) {
  render(<FilterChipRow options={OPTIONS} value={value} onChange={onChange} ariaLabel="Filter colors" testIdPrefix="color" />);
  return onChange;
}

describe("FilterChipRow", () => {
  it("is a labelled group of toggle buttons, not a tab list", () => {
    renderRow(null);
    expect(screen.getByRole("group", { name: "Filter colors" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("marks only the active chip as pressed", () => {
    renderRow("red");
    expect(screen.getByTestId("color-red")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("color-all")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("color-blue")).toHaveAttribute("aria-pressed", "false");
  });

  it("presses the All chip when nothing is selected", () => {
    renderRow(null);
    expect(screen.getByTestId("color-all")).toHaveAttribute("aria-pressed", "true");
  });

  it("reports the clicked value, and null for All", async () => {
    const onChange = renderRow("red");
    await userEvent.click(screen.getByTestId("color-blue"));
    expect(onChange).toHaveBeenLastCalledWith("blue");
    await userEvent.click(screen.getByTestId("color-all"));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
