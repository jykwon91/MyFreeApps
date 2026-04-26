import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ColumnFilter from "@/shared/components/table/ColumnFilter";
import type { Column } from "@tanstack/react-table";

function makeColumn(filterValue?: string[]): Column<unknown, unknown> & { setFilterValue: ReturnType<typeof vi.fn> } {
  const setFilterValue = vi.fn();
  return {
    id: "status",
    getFilterValue: vi.fn(() => filterValue),
    setFilterValue,
  } as unknown as Column<unknown, unknown> & { setFilterValue: ReturnType<typeof vi.fn> };
}

const OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

describe("ColumnFilter — MultiSelectFilter", () => {
  it("renders filter trigger button", () => {
    const column = makeColumn();
    render(<ColumnFilter column={column} options={OPTIONS} />);
    expect(screen.getByRole("button", { name: "Filter status" })).toBeInTheDocument();
  });

  it("does not show dropdown options before clicking", () => {
    const column = makeColumn();
    render(<ColumnFilter column={column} options={OPTIONS} />);
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
  });

  it("shows all options after clicking the filter button", async () => {
    const user = userEvent.setup();
    const column = makeColumn();
    render(<ColumnFilter column={column} options={OPTIONS} />);

    await user.click(screen.getByRole("button", { name: "Filter status" }));

    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("calls setFilterValue with selected value when option toggled on", async () => {
    const user = userEvent.setup();
    const column = makeColumn();
    render(<ColumnFilter column={column} options={OPTIONS} />);

    await user.click(screen.getByRole("button", { name: "Filter status" }));
    await user.click(screen.getByRole("checkbox", { name: "Pending" }));

    expect(column.setFilterValue).toHaveBeenCalledWith(["pending"]);
  });

  it("calls setFilterValue with undefined when last selected value is deselected", async () => {
    const user = userEvent.setup();
    const column = makeColumn(["pending"]);
    render(<ColumnFilter column={column} options={OPTIONS} />);

    await user.click(screen.getByRole("button", { name: "Filter status" }));
    await user.click(screen.getByRole("checkbox", { name: "Pending" }));

    expect(column.setFilterValue).toHaveBeenCalledWith(undefined);
  });

  it("shows selected count badge when filter is active", () => {
    const column = makeColumn(["pending", "approved"]);
    render(<ColumnFilter column={column} options={OPTIONS} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows clear filter button when filter is active and dropdown is open", async () => {
    const user = userEvent.setup();
    const column = makeColumn(["pending"]);
    render(<ColumnFilter column={column} options={OPTIONS} />);

    await user.click(screen.getByRole("button", { name: "Filter status" }));

    expect(screen.getByText("Clear filter")).toBeInTheDocument();
  });

  it("clears filter and closes dropdown when Clear filter is clicked", async () => {
    const user = userEvent.setup();
    const column = makeColumn(["pending"]);
    render(<ColumnFilter column={column} options={OPTIONS} />);

    await user.click(screen.getByRole("button", { name: "Filter status" }));
    await user.click(screen.getByText("Clear filter"));

    expect(column.setFilterValue).toHaveBeenCalledWith(undefined);
    expect(screen.queryByText("Clear filter")).not.toBeInTheDocument();
  });
});

describe("ColumnFilter — DateRangeFilter", () => {
  it("renders when enableDateRange is true", () => {
    const column = makeColumn();
    render(<ColumnFilter column={column} enableDateRange />);
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(screen.getByLabelText("To date")).toBeInTheDocument();
  });

  it("both date inputs are type date", () => {
    const column = makeColumn();
    render(<ColumnFilter column={column} enableDateRange />);
    const fromInput = screen.getByLabelText("From date") as HTMLInputElement;
    const toInput = screen.getByLabelText("To date") as HTMLInputElement;
    expect(fromInput.type).toBe("date");
    expect(toInput.type).toBe("date");
  });

  it("calls setFilterValue with new from date when from input changes", async () => {
    const user = userEvent.setup();
    const column = makeColumn();
    render(<ColumnFilter column={column} enableDateRange />);

    const fromInput = screen.getByLabelText("From date");
    await user.type(fromInput, "2025-01-01");

    expect(column.setFilterValue).toHaveBeenCalled();
  });

  it("renders nothing when no options and enableDateRange is false", () => {
    const column = makeColumn();
    const { container } = render(<ColumnFilter column={column} />);
    expect(container.firstChild).toBeNull();
  });
});
