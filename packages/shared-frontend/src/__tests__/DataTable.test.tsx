import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DataTable from "../components/data/DataTable";
import type { ColumnDef } from "../components/data/DataTable";

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
});
