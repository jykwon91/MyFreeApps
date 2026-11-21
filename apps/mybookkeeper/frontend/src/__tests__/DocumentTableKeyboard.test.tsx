import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useState } from "react";
import { useTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { appTableFeatures, type AppTableFeatures } from "@/shared/lib/table-features";
import { useDocumentColumns } from "@/shared/hooks/useDocumentColumns";
import DocumentTable from "@/app/features/documents/DocumentTable";
import type { Document } from "@mybookkeeper/api-client/types/document/document";
import type { SelectAllControl } from "@/shared/types/select-all-control";

const SELECT_ALL: SelectAllControl = { checked: false, indeterminate: false, isLoading: false, onToggle: vi.fn() };

vi.mock("@platform/core/utils/timeSince", () => ({ timeSince: (s: string) => s }));
vi.mock("@/app/features/documents/StatusBadge", () => ({ default: () => <span>status</span> }));
vi.mock("@/app/features/documents/DocumentRowActions", () => ({ default: () => <button type="button">Actions</button> }));

const DOC: Document = {
  id: "doc-1",
  user_id: "user-1",
  property_id: null,
  created_at: "2025-01-15T10:00:00Z",
  updated_at: "2025-01-15T10:00:00Z",
  file_name: "invoice.pdf",
  file_type: "pdf",
  document_type: null,
  file_mime_type: "application/pdf",
  email_message_id: null,
  external_id: null,
  external_source: null,
  source: "upload",
  status: "completed",
  error_message: null,
  batch_id: null,
  is_escrow_paid: false,
  deleted_at: null,
};

function Harness({ onRowClick }: { onRowClick: (doc: Document) => void }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = useDocumentColumns({ onOpen: onRowClick, onDelete: vi.fn(), selectAll: SELECT_ALL });
  const table = useTable({
    features: appTableFeatures,
    data: [DOC],
    columns: columns as ColumnDef<AppTableFeatures, Document, unknown>[],
    getRowId: (row) => row.id,
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
  });
  return (
    <DocumentTable
      table={table}
      colCount={columns.length}
      filterOptions={{}}
      onRowClick={onRowClick}
      total={1}
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={vi.fn()}
    />
  );
}

describe("DocumentTable keyboard access", () => {
  it("keeps the row a plain table row and opens it from a real button in the file cell", () => {
    const onRowClick = vi.fn();
    render(<Harness onRowClick={onRowClick} />);
    const row = screen.getAllByRole("row")[1];
    expect(row).not.toHaveAttribute("role");
    expect(row).not.toHaveAttribute("tabindex");
    const open = within(row).getByRole("button", { name: "Open invoice.pdf" });
    fireEvent.click(open);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(DOC);
  });

  it("leaves the row's other controls reachable by role", () => {
    render(<Harness onRowClick={vi.fn()} />);
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getByRole("checkbox", { name: "Select invoice.pdf" })).toBeInTheDocument();
    expect(within(row).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([
      "Open invoice.pdf",
      "Actions",
    ]);
  });

  it("still opens on a click anywhere on the row, but not on a click on its checkbox", () => {
    const onRowClick = vi.fn();
    render(<Harness onRowClick={onRowClick} />);
    const row = screen.getAllByRole("row")[1];
    fireEvent.click(within(row).getByRole("checkbox", { name: "Select invoice.pdf" }));
    expect(onRowClick).not.toHaveBeenCalled();
    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("sorts from a header button and reports the order through aria-sort", () => {
    render(<Harness onRowClick={vi.fn()} />);
    const header = screen.getAllByRole("columnheader").find((th) => within(th).queryByRole("button", { name: /status/i }))!;
    expect(header).toHaveAttribute("scope", "col");
    expect(header).toHaveAttribute("aria-sort", "none");
    const button = within(header).getByRole("button", { name: /status/i });
    fireEvent.click(button);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(button);
    expect(header).toHaveAttribute("aria-sort", "descending");
  });
});
