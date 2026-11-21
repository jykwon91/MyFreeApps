import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createPortal } from "react-dom";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
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

function PersonPage() {
  const { id } = useParams();
  return <p>Person {id}</p>;
}

describe("DataTable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  describe("clickable rows", () => {
    function bodyRows(): HTMLElement[] {
      return screen.getAllByRole("row").slice(1);
    }

    it("keeps each row a table row with cells, and puts a named button in the first cell", () => {
      render(<DataTable data={data} columns={columns} onRowClick={vi.fn()} getRowId={(row) => row.id} />);
      const rows = bodyRows();
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).not.toHaveAttribute("role");
        expect(row).not.toHaveAttribute("tabindex");
        expect(within(row).getAllByRole("cell")).toHaveLength(2);
      }
      const [firstCell, secondCell] = within(rows[0]).getAllByRole("cell");
      expect(within(firstCell).getByRole("button", { name: "Alice" })).toHaveAttribute("type", "button");
      expect(within(secondCell).queryByRole("button")).toBeNull();
      expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    });

    it("opens the row with Enter and with Space on its button, once each", async () => {
      const onRowClick = vi.fn();
      render(<DataTable data={data} columns={columns} onRowClick={onRowClick} getRowId={(row) => row.id} />);
      const button = screen.getByRole("button", { name: "Bob" });
      button.focus();
      await userEvent.keyboard("{Enter}");
      expect(onRowClick).toHaveBeenCalledTimes(1);
      expect(onRowClick).toHaveBeenLastCalledWith(data[1]);
      await userEvent.keyboard(" ");
      expect(onRowClick).toHaveBeenCalledTimes(2);
      expect(onRowClick).toHaveBeenLastCalledWith(data[1]);
    });

    it("reaches the row buttons with Tab after the header buttons", async () => {
      render(<DataTable data={data} columns={columns} onRowClick={vi.fn()} getRowId={(row) => row.id} />);
      await userEvent.tab();
      await userEvent.tab();
      await userEvent.tab();
      expect(screen.getByRole("button", { name: "Alice" })).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole("button", { name: "Bob" })).toHaveFocus();
    });

    it("opens once for a click on the button and once for a click elsewhere on the row", async () => {
      const onRowClick = vi.fn();
      render(<DataTable data={data} columns={columns} onRowClick={onRowClick} getRowId={(row) => row.id} />);
      await userEvent.click(screen.getByRole("button", { name: "Alice" }));
      expect(onRowClick).toHaveBeenCalledTimes(1);
      expect(onRowClick).toHaveBeenLastCalledWith(data[0]);
      await userEvent.click(screen.getByText("Inactive"));
      expect(onRowClick).toHaveBeenCalledTimes(2);
      expect(onRowClick).toHaveBeenLastCalledWith(data[1]);
    });

    it("leaves clicks on another control in the row to that control", async () => {
      const onRowClick = vi.fn();
      const onArchive = vi.fn();
      const withAction: ColumnDef<Row>[] = [
        ...columns,
        {
          id: "actions",
          header: "Actions",
          enableSorting: false,
          cell: () => (
            <button type="button" onClick={onArchive}>
              Archive
            </button>
          ),
        },
      ];
      render(<DataTable data={data} columns={withAction} onRowClick={onRowClick} getRowId={(row) => row.id} />);
      await userEvent.click(within(bodyRows()[0]).getByRole("button", { name: "Archive" }));
      expect(onArchive).toHaveBeenCalledTimes(1);
      expect(onRowClick).not.toHaveBeenCalled();
    });

    it("puts the button in the column named by primaryColumnId", async () => {
      const onRowClick = vi.fn();
      render(
        <DataTable data={data} columns={columns} onRowClick={onRowClick} primaryColumnId="status" getRowId={(row) => row.id} />,
      );
      const [nameCell, statusCell] = within(bodyRows()[0]).getAllByRole("cell");
      expect(within(nameCell).queryByRole("button")).toBeNull();
      await userEvent.click(within(statusCell).getByRole("button", { name: "Active" }));
      expect(onRowClick).toHaveBeenCalledTimes(1);
      expect(onRowClick).toHaveBeenCalledWith(data[0]);
    });

    it("rejects a primaryColumnId that isn't one of its columns", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() =>
        render(<DataTable data={data} columns={columns} onRowClick={vi.fn()} primaryColumnId="missing" />),
      ).toThrow(/primaryColumnId "missing"/);
    });

    it("leaves clicks in a portalled menu opened from a cell to that menu", async () => {
      const onRowClick = vi.fn();
      const onItem = vi.fn();
      const withMenu: ColumnDef<Row>[] = [
        ...columns,
        {
          id: "menu",
          header: "Menu",
          enableSorting: false,
          cell: () =>
            createPortal(
              <div>
                <span>Menu heading</span>
                <button type="button" onClick={onItem}>
                  Item
                </button>
              </div>,
              document.body,
            ),
        },
      ];
      render(<DataTable data={[data[0]]} columns={withMenu} onRowClick={onRowClick} getRowId={(row) => row.id} />);
      await userEvent.click(screen.getByRole("button", { name: "Item" }));
      await userEvent.click(screen.getByText("Menu heading"));
      expect(onItem).toHaveBeenCalledTimes(1);
      expect(onRowClick).not.toHaveBeenCalled();
    });

    it("names the row's button with getRowActionLabel", async () => {
      const onRowClick = vi.fn();
      render(
        <DataTable
          data={data}
          columns={columns}
          onRowClick={onRowClick}
          getRowActionLabel={(row) => `Open ${row.name} (${row.status})`}
          getRowId={(row) => row.id}
        />,
      );
      await userEvent.click(screen.getByRole("button", { name: "Open Bob (Inactive)" }));
      expect(onRowClick).toHaveBeenCalledWith(data[1]);
    });

    it("reports a control nested inside the row's button", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const nested: ColumnDef<Row>[] = [
        { id: "name", header: "Name", cell: () => <a href="/elsewhere">Alice</a> },
      ];
      render(<DataTable data={[data[0]]} columns={nested} onRowClick={vi.fn()} getRowId={(row) => row.id} />);
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/can't nest/), expect.any(HTMLAnchorElement));
    });

    it("does not report a primary cell that is plain text", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      render(<DataTable data={data} columns={columns} onRowClick={vi.fn()} getRowId={(row) => row.id} />);
      expect(error).not.toHaveBeenCalled();
    });

    it("does not make rows interactive when onRowClick is not provided", () => {
      render(<DataTable data={data} columns={columns} />);
      const body = screen.getByRole("table").querySelector("tbody");
      if (!body) throw new Error("table has no body");
      expect(within(body).queryAllByRole("button")).toHaveLength(0);
    });
  });

  describe("rows that open a page", () => {
    function renderLinked() {
      return render(
        <MemoryRouter initialEntries={["/people"]}>
          <Routes>
            <Route
              path="/people"
              element={
                <DataTable
                  data={data}
                  columns={columns}
                  getRowHref={(row) => `/people/${row.id}`}
                  getRowActionLabel={(row) => `Open ${row.name}`}
                  getRowId={(row) => row.id}
                />
              }
            />
            <Route path="/people/:id" element={<PersonPage />} />
          </Routes>
        </MemoryRouter>,
      );
    }

    it("keeps rows as table rows and makes the primary cell a link to the row's page", () => {
      renderLinked();
      const rows = screen.getAllByRole("row").slice(1);
      expect(rows[0]).not.toHaveAttribute("role");
      expect(within(rows[0]).getAllByRole("cell")).toHaveLength(2);
      const link = within(rows[0]).getByRole("link", { name: "Open Alice" });
      expect(link).toHaveAttribute("href", "/people/1");
      expect(within(rows[0]).queryByRole("button")).toBeNull();
    });

    it("follows the link with Enter", async () => {
      renderLinked();
      screen.getByRole("link", { name: "Open Bob" }).focus();
      await userEvent.keyboard("{Enter}");
      expect(screen.getByText("Person 2")).toBeInTheDocument();
    });

    it("goes to the row's page on a click elsewhere on the row", async () => {
      renderLinked();
      await userEvent.click(screen.getByText("Inactive"));
      expect(screen.getByText("Person 2")).toBeInTheDocument();
    });
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
