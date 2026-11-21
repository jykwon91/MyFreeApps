import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  useTable,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { appTableFeatures, type AppTableFeatures } from "@/shared/lib/table-features";
import { useDocumentColumns } from "@/shared/hooks/useDocumentColumns";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES } from "@/shared/lib/constants";
import type { Document } from "@mybookkeeper/api-client/types/document/document";
import type { SelectAllControl } from "@/shared/types/select-all-control";

const SELECT_ALL: SelectAllControl = { checked: false, indeterminate: false, isLoading: false, onToggle: vi.fn() };

vi.mock("@platform/core/utils/timeSince", () => ({ timeSince: (s: string) => s }));

vi.mock("@/shared/utils/date", () => ({
  formatDate: (s: string) => s,
}))

vi.mock("@/app/features/documents/StatusBadge", () => ({
  default: ({ status }: { status: string }) =>
    <span data-testid="status-badge">{status}</span>,
}))

vi.mock("@/shared/components/ui/IndeterminateCheckbox", () => ({
  default: ({ checked, onChange, "aria-label": label }: { checked: boolean; onChange: () => void; "aria-label": string }) => (
    <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} />
  ),
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
  const columns = useDocumentColumns({ onOpen: vi.fn(), onDelete: vi.fn(), selectAll: SELECT_ALL });
  const table = useTable({
    features: appTableFeatures,
    data: [doc],
    columns: columns as ColumnDef<AppTableFeatures, Document, unknown>[],
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
// select column header — "select all" reaches documents not loaded
// ---------------------------------------------------------------------------

function SelectHeader({ selectAll }: { selectAll: SelectAllControl }) {
  const columns = useDocumentColumns({ onOpen: vi.fn(), onDelete: vi.fn(), selectAll });
  const table = useTable({
    features: appTableFeatures,
    data: [makeDocument()],
    columns: columns as ColumnDef<AppTableFeatures, Document, unknown>[],
    getRowId: (row) => row.id,
  });
  const header = table.getHeaderGroups()[0].headers[0];
  return <div>{flexRender(header.column.columnDef.header, header.getContext())}</div>;
}

describe("useDocumentColumns — select all", () => {
  it("hands the header checkbox to the select-all control, not to the loaded rows", () => {
    const onToggle = vi.fn();
    render(<SelectHeader selectAll={{ ...SELECT_ALL, checked: true, onToggle }} />);

    const box = screen.getByRole("checkbox", { name: "Select all documents" });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner while the matching documents are fetched", () => {
    render(<SelectHeader selectAll={{ ...SELECT_ALL, isLoading: true }} />);

    expect(screen.getByRole("status", { name: "Selecting all matching documents" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// actions column — re-extract button
// ---------------------------------------------------------------------------

function DocumentRow({ doc, onReExtract }: { doc: Document; onReExtract?: (id: string) => void }) {
  const columns = useDocumentColumns({ onOpen: vi.fn(), onDelete: vi.fn(), onReExtract, canWrite: true, selectAll: SELECT_ALL });
  const table = useTable({
    features: appTableFeatures,
    data: [doc],
    columns: columns as ColumnDef<AppTableFeatures, Document, unknown>[],
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
