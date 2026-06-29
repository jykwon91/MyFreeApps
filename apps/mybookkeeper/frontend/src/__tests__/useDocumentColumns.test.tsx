import { describe, it, expect, vi } from "vitest";
import { render, renderHook, screen, fireEvent } from "@testing-library/react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useDocumentColumns } from "@/shared/hooks/useDocumentColumns";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES } from "@/shared/lib/constants";
import type { Document } from "@/shared/types/document/document";

interface ColumnWithFilter {
  filterFn: (row: { getValue: () => unknown }, columnId: string, filterValue: string[]) => boolean;
}

function findColumnByAccessorKey(columns: ColumnDef<Document, unknown>[], key: string): ColumnWithFilter {
  // RTK/tanstack types don't expose accessorKey as a direct property at the union level,
  // so we cast to access it without polluting call sites with `any`.
  const col = columns.find((c) => (c as { accessorKey?: string }).accessorKey === key);
  if (!col) throw new Error(`Column "${key}" not found`);
  return col as unknown as ColumnWithFilter;
}

vi.mock("@/shared/utils/date", () => ({
  formatDate: (s: string) => s,
  timeAgo: (s: string) => s,
}))

vi.mock("@/app/features/documents/StatusBadge", () => ({
  default: ({ status }: { status: string }) =>
    <span data-testid="status-badge">{status}</span>,
}))

vi.mock("@/shared/components/ui/IndeterminateCheckbox", () => ({
  default: () => <input type="checkbox" />,
}))

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    Button: ({ children, ...props }: React.PropsWithChildren<Record<string,unknown>>) =>
      <button {...(props as object)}>{children}</button>,
  };
})

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
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
    ...overrides,
  };
}

function DocumentTypeCell({ doc }: { doc: Document }) {
  const columns = useDocumentColumns({ onDelete: vi.fn() });
  const table = useReactTable({
    data: [doc],
    columns: columns as ColumnDef<Document, unknown>[],
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <table>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} data-column={cell.column.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// document_type column cell rendering
// ---------------------------------------------------------------------------

describe("useDocumentColumns — document_type column", () => {
  it("renders the human-readable label for a known document type", () => {
    const doc = makeDocument({ document_type: "invoice" });
    render(<DocumentTypeCell doc={doc} />);

    const cell = document.querySelector("[data-column=document_type]");
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe("Invoice");
  });

  it("renders em-dash when document_type is null", () => {
    const doc = makeDocument({ document_type: null });
    render(<DocumentTypeCell doc={doc} />);

    const cell = document.querySelector("[data-column=document_type]");
    expect(cell!.textContent).toBe("—");
  });

  it("renders the raw value when document_type has no label mapping", () => {
    const doc = makeDocument({ document_type: "custom_type" });
    render(<DocumentTypeCell doc={doc} />);

    const cell = document.querySelector("[data-column=document_type]");
    expect(cell!.textContent).toBe("custom_type");
  });

  it("renders year-end statement label for year_end_statement", () => {
    const doc = makeDocument({ document_type: "year_end_statement" });
    render(<DocumentTypeCell doc={doc} />);

    const cell = document.querySelector("[data-column=document_type]");
    expect(cell!.textContent).toBe("Year-End Statement");
  });

  it("renders 1099-K label for 1099_k", () => {
    const doc = makeDocument({ document_type: "1099_k" });
    render(<DocumentTypeCell doc={doc} />);

    const cell = document.querySelector("[data-column=document_type]");
    expect(cell!.textContent).toBe("1099-K");
  });
});

// ---------------------------------------------------------------------------
// document_type filter function
// ---------------------------------------------------------------------------

describe("useDocumentColumns — document_type filterFn", () => {
  it("includes row when document_type matches filter value", () => {
    const { result } = renderHook(() => useDocumentColumns({ onDelete: vi.fn() }));
    const col = findColumnByAccessorKey(result.current as ColumnDef<Document, unknown>[], "document_type");
    const mockRow = { getValue: () => "invoice" };
    expect(col.filterFn(mockRow, "document_type", ["invoice", "receipt"])).toBe(true);
  });

  it("excludes row when document_type is not in filter values", () => {
    const { result } = renderHook(() => useDocumentColumns({ onDelete: vi.fn() }));
    const col = findColumnByAccessorKey(result.current as ColumnDef<Document, unknown>[], "document_type");
    const mockRow = { getValue: () => "lease" };
    expect(col.filterFn(mockRow, "document_type", ["invoice", "receipt"])).toBe(false);
  });

  it("treats null document_type as empty string for filter matching", () => {
    const { result } = renderHook(() => useDocumentColumns({ onDelete: vi.fn() }));
    const col = findColumnByAccessorKey(result.current as ColumnDef<Document, unknown>[], "document_type");
    const mockRow = { getValue: () => null };
    expect(col.filterFn(mockRow, "document_type", [""])).toBe(true);
    expect(col.filterFn(mockRow, "document_type", ["invoice"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// actions column — re-extract button
// ---------------------------------------------------------------------------

function DocumentRow({ doc, onReExtract }: { doc: Document; onReExtract?: (id: string) => void }) {
  const columns = useDocumentColumns({ onDelete: vi.fn(), onReExtract, canWrite: true });
  const table = useReactTable({
    data: [doc],
    columns: columns as ColumnDef<Document, unknown>[],
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <table>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} data-column={cell.column.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

describe("useDocumentColumns — re-extract action", () => {
  it("renders a re-extract button for failed documents and calls onReExtract on click", () => {
    const onReExtract = vi.fn();
    const doc = makeDocument({ status: "failed", error_message: "boom" });
    render(<DocumentRow doc={doc} onReExtract={onReExtract} />);

    const btn = screen.getByRole("button", { name: "Re-extract this document" });
    fireEvent.click(btn);
    expect(onReExtract).toHaveBeenCalledWith("doc-1");
  });

  it("does not render a re-extract button for completed documents", () => {
    const doc = makeDocument({ status: "completed" });
    render(<DocumentRow doc={doc} onReExtract={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Re-extract this document" })).toBeNull();
  });

  it("does not render a re-extract button when onReExtract is not provided", () => {
    const doc = makeDocument({ status: "failed", error_message: "boom" });
    render(<DocumentRow doc={doc} />);

    expect(screen.queryByRole("button", { name: "Re-extract this document" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DOCUMENT_TYPE_LABELS coverage
// ---------------------------------------------------------------------------

describe("DOCUMENT_TYPE_LABELS — coverage of DOCUMENT_TYPES", () => {
  it("has a label entry for every type in DOCUMENT_TYPES", () => {
    const missing = DOCUMENT_TYPES.filter((t) => !(t in DOCUMENT_TYPE_LABELS));
    expect(missing).toHaveLength(0);
  });

  it("no label value is an empty string", () => {
    const empty = Object.entries(DOCUMENT_TYPE_LABELS)
      .filter(([, v]) => v.trim() === "")
      .map(([k]) => k);
    expect(empty).toHaveLength(0);
  });
});
