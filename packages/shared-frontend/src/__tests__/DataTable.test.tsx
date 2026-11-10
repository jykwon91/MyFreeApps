import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DataTable from "../components/data/DataTable";
import ControlledSortDataTable from "./ControlledSortDataTable";
import type { ColumnDef } from "../types/data-table-column-def";

interface Row {
  id: string;
  name: string;
  status: string;
}

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "status", header: "Status" },
];

const data: Row[] = [
  { id: "1", name: "Alice", status: "Active" },
  { id: "2", name: "Bob", status: "Inactive" },
];

describe("DataTable", () => {
  it("renders data rows", () => {
    render(<DataTable data={data} columns={columns} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders column headers", () => {
    render(<DataTable data={data} columns={columns} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("renders skeleton rows when loading=true", () => {
    render(
      <DataTable
        data={[]}
        columns={columns}
        loading={true}
        loadingRowCount={3}
      />
    );
    // Skeleton cells: 3 rows × 2 columns = 6 skeleton divs
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(6);
  });

  it("renders emptyState when data is empty and not loading", () => {
    render(
      <DataTable
        data={[]}
        columns={columns}
        emptyState={<div>No results found</div>}
      />
    );
    expect(screen.getByText("No results found")).toBeInTheDocument();
  });

  it("does not render emptyState while loading", () => {
    render(
      <DataTable
        data={[]}
        columns={columns}
        loading={true}
        emptyState={<div>No results found</div>}
      />
    );
    expect(screen.queryByText("No results found")).toBeNull();
  });

  it("calls onRowClick with row data when a row is clicked", async () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        data={data}
        columns={columns}
        onRowClick={onRowClick}
        getRowId={(row) => row.id}
      />
    );
    await userEvent.click(screen.getByText("Alice"));
    expect(onRowClick).toHaveBeenCalledWith(data[0]);
  });

  it("calls onRowClick when Enter is pressed on a row", async () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        data={data}
        columns={columns}
        onRowClick={onRowClick}
        getRowId={(row) => row.id}
      />
    );
    const body = screen.getByRole("table").querySelector("tbody");
    if (!body) throw new Error("table has no body");
    const rows = within(body).getAllByRole("button");
    rows[0].focus();
    await userEvent.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalled();
  });

  it("does not make rows interactive when onRowClick is not provided", () => {
    render(<DataTable data={data} columns={columns} />);
    const body = screen.getByRole("table").querySelector("tbody");
    if (!body) throw new Error("table has no body");
    expect(within(body).queryAllByRole("button")).toHaveLength(0);
  });

  describe("sorting", () => {
    // Names out of order on purpose so every sort step changes the row order.
    const unsorted: Row[] = [
      { id: "1", name: "Bob", status: "Active" },
      { id: "2", name: "Carol", status: "Inactive" },
      { id: "3", name: "Alice", status: "Active" },
    ];

    function nameHeader(): HTMLElement {
      return screen.getByRole("columnheader", { name: /name/i });
    }

    function nameSortButton(): HTMLElement {
      return within(nameHeader()).getByRole("button", { name: /name/i });
    }

    function names(): string[] {
      const body = screen.getByRole("table").querySelector("tbody");
      if (!body) throw new Error("table has no body");
      return Array.from(body.querySelectorAll("tr")).map(
        (row) => within(row).getAllByRole("cell")[0]?.textContent ?? "",
      );
    }

    it("sorts on header click without sorting props (asc, desc, then none)", async () => {
      render(<DataTable data={unsorted} columns={columns} />);
      expect(nameHeader()).toHaveAttribute("aria-sort", "none");
      expect(names()).toEqual(["Bob", "Carol", "Alice"]);

      await userEvent.click(nameSortButton());
      expect(nameHeader()).toHaveAttribute("aria-sort", "ascending");
      expect(names()).toEqual(["Alice", "Bob", "Carol"]);

      await userEvent.click(nameSortButton());
      expect(nameHeader()).toHaveAttribute("aria-sort", "descending");
      expect(names()).toEqual(["Carol", "Bob", "Alice"]);

      await userEvent.click(nameSortButton());
      expect(nameHeader()).toHaveAttribute("aria-sort", "none");
      expect(names()).toEqual(["Bob", "Carol", "Alice"]);
    });

    it("starts from defaultSorting and keeps sorting from there", async () => {
      render(
        <DataTable data={unsorted} columns={columns} defaultSorting={[{ id: "name", desc: true }]} />,
      );
      expect(nameHeader()).toHaveAttribute("aria-sort", "descending");
      expect(names()).toEqual(["Carol", "Bob", "Alice"]);

      await userEvent.click(nameSortButton());
      expect(nameHeader()).toHaveAttribute("aria-sort", "none");
      expect(names()).toEqual(["Bob", "Carol", "Alice"]);
    });

    it("reports sort changes in uncontrolled mode", async () => {
      const onSortingChange = vi.fn();
      render(<DataTable data={unsorted} columns={columns} onSortingChange={onSortingChange} />);
      await userEvent.click(nameSortButton());
      expect(onSortingChange).toHaveBeenLastCalledWith([{ id: "name", desc: false }]);
      expect(names()).toEqual(["Alice", "Bob", "Carol"]);
    });

    it("follows the parent's sorting in controlled mode", async () => {
      const onSortingChange = vi.fn();
      render(<ControlledSortDataTable data={unsorted} columns={columns} onSortingChange={onSortingChange} />);

      await userEvent.click(nameSortButton());
      expect(nameHeader()).toHaveAttribute("aria-sort", "ascending");
      expect(names()).toEqual(["Alice", "Bob", "Carol"]);

      await userEvent.click(nameSortButton());
      expect(nameHeader()).toHaveAttribute("aria-sort", "descending");
      expect(names()).toEqual(["Carol", "Bob", "Alice"]);
      expect(onSortingChange.mock.calls).toEqual([
        [[{ id: "name", desc: false }]],
        [[{ id: "name", desc: true }]],
      ]);
    });

    it("does not move a controlled sort the parent doesn't apply", async () => {
      const onSortingChange = vi.fn();
      render(
        <DataTable
          data={unsorted}
          columns={columns}
          sorting={[{ id: "name", desc: false }]}
          onSortingChange={onSortingChange}
        />,
      );
      await userEvent.click(nameSortButton());
      expect(onSortingChange).toHaveBeenCalledWith([{ id: "name", desc: true }]);
      expect(nameHeader()).toHaveAttribute("aria-sort", "ascending");
      expect(names()).toEqual(["Alice", "Bob", "Carol"]);
    });

    it("ignores defaultSorting when sorting is controlled", () => {
      render(
        <DataTable
          data={unsorted}
          columns={columns}
          sorting={[]}
          defaultSorting={[{ id: "name", desc: true }]}
          onSortingChange={vi.fn()}
        />,
      );
      expect(nameHeader()).toHaveAttribute("aria-sort", "none");
      expect(names()).toEqual(["Bob", "Carol", "Alice"]);
    });

    it("puts each sortable label in a header button that sorts from the keyboard", async () => {
      render(<DataTable data={unsorted} columns={columns} />);
      const button = nameSortButton();
      expect(button).toHaveAttribute("type", "button");
      expect(nameHeader()).toHaveAttribute("scope", "col");

      button.focus();
      await userEvent.keyboard("{Enter}");
      expect(nameHeader()).toHaveAttribute("aria-sort", "ascending");
      expect(names()).toEqual(["Alice", "Bob", "Carol"]);

      await userEvent.keyboard(" ");
      expect(nameHeader()).toHaveAttribute("aria-sort", "descending");
      expect(names()).toEqual(["Carol", "Bob", "Alice"]);
    });

    it("reaches the header buttons with Tab", async () => {
      render(<DataTable data={unsorted} columns={columns} />);
      await userEvent.tab();
      expect(nameSortButton()).toHaveFocus();
    });

    it("renders a column that can't sort as a plain header with no button or aria-sort", () => {
      const fixedColumns: ColumnDef<Row>[] = [
        { accessorKey: "name", header: "Name" },
        { accessorKey: "status", header: "Status", enableSorting: false },
      ];
      render(<DataTable data={unsorted} columns={fixedColumns} />);
      const statusHeader = screen.getByRole("columnheader", { name: /status/i });
      expect(within(statusHeader).queryByRole("button")).toBeNull();
      expect(statusHeader).not.toHaveAttribute("aria-sort");
    });
  });

  it("with manualSorting, reports the sort but keeps rows in the order given", async () => {
    const onSortingChange = vi.fn();
    const { rerender } = render(
      <DataTable data={data} columns={columns} sorting={[]} onSortingChange={onSortingChange} manualSorting />,
    );
    const header = () => screen.getByRole("columnheader", { name: /name/i });
    await userEvent.click(within(header()).getByRole("button", { name: /name/i }));
    expect(onSortingChange).toHaveBeenCalledWith([{ id: "name", desc: false }]);
    rerender(
      <DataTable
        data={data}
        columns={columns}
        sorting={[{ id: "name", desc: true }]}
        onSortingChange={onSortingChange}
        manualSorting
      />,
    );
    expect(header()).toHaveAttribute("aria-sort", "descending");
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Alice", "Active", "Bob", "Inactive"]);
  });

  it("with enableSortingRemoval off, a sorted header only flips direction and never reads as unsorted", async () => {
    render(
      <DataTable
        data={data}
        columns={columns}
        defaultSorting={[{ id: "name", desc: true }]}
        enableSortingRemoval={false}
      />,
    );
    const header = () => screen.getByRole("columnheader", { name: /name/i });
    expect(header()).toHaveAttribute("aria-sort", "descending");
    const directions: (string | null)[] = [];
    for (let i = 0; i < 3; i += 1) {
      await userEvent.click(within(header()).getByRole("button", { name: /name/i }));
      directions.push(header().getAttribute("aria-sort"));
    }
    expect(directions).toEqual(["ascending", "descending", "ascending"]);
  });
});
