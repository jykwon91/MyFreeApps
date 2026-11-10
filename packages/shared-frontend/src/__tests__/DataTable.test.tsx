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
    const rows = screen.getAllByRole("button");
    rows[0].focus();
    await userEvent.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalled();
  });

  it("does not make rows interactive when onRowClick is not provided", () => {
    render(<DataTable data={data} columns={columns} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
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

      await userEvent.click(nameHeader());
      expect(nameHeader()).toHaveAttribute("aria-sort", "ascending");
      expect(names()).toEqual(["Alice", "Bob", "Carol"]);

      await userEvent.click(nameHeader());
      expect(nameHeader()).toHaveAttribute("aria-sort", "descending");
      expect(names()).toEqual(["Carol", "Bob", "Alice"]);

      await userEvent.click(nameHeader());
      expect(nameHeader()).toHaveAttribute("aria-sort", "none");
      expect(names()).toEqual(["Bob", "Carol", "Alice"]);
    });

    it("starts from defaultSorting and keeps sorting from there", async () => {
      render(
        <DataTable data={unsorted} columns={columns} defaultSorting={[{ id: "name", desc: true }]} />,
      );
      expect(nameHeader()).toHaveAttribute("aria-sort", "descending");
      expect(names()).toEqual(["Carol", "Bob", "Alice"]);

      await userEvent.click(nameHeader());
      expect(nameHeader()).toHaveAttribute("aria-sort", "none");
      expect(names()).toEqual(["Bob", "Carol", "Alice"]);
    });

    it("reports sort changes in uncontrolled mode", async () => {
      const onSortingChange = vi.fn();
      render(<DataTable data={unsorted} columns={columns} onSortingChange={onSortingChange} />);
      await userEvent.click(nameHeader());
      expect(onSortingChange).toHaveBeenLastCalledWith([{ id: "name", desc: false }]);
      expect(names()).toEqual(["Alice", "Bob", "Carol"]);
    });

    it("follows the parent's sorting in controlled mode", async () => {
      const onSortingChange = vi.fn();
      render(<ControlledSortDataTable data={unsorted} columns={columns} onSortingChange={onSortingChange} />);

      await userEvent.click(nameHeader());
      expect(nameHeader()).toHaveAttribute("aria-sort", "ascending");
      expect(names()).toEqual(["Alice", "Bob", "Carol"]);

      await userEvent.click(nameHeader());
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
      await userEvent.click(nameHeader());
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
  });
});
