import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DocumentRowActions from "@/app/features/documents/DocumentRowActions";
import type { Document } from "@/shared/types/document/document";

// Pass-through Button so the className/aria-label/onClick land directly on a
// real <button>, keeping assertions about touch-target classes deterministic.
vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    Button: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      <button {...(props as object)}>{children}</button>,
  };
});

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

describe("DocumentRowActions", () => {
  it("renders nothing when the user cannot write", () => {
    const { container } = render(
      <DocumentRowActions doc={makeDocument({ status: "failed" })} onDelete={vi.fn()} onReExtract={vi.fn()} canWrite={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a re-extract action only for failed documents and calls onReExtract on click", () => {
    const onReExtract = vi.fn();
    render(<DocumentRowActions doc={makeDocument({ status: "failed" })} onDelete={vi.fn()} onReExtract={onReExtract} />);

    const btn = screen.getByRole("button", { name: "Re-extract this document" });
    fireEvent.click(btn);
    expect(onReExtract).toHaveBeenCalledWith("doc-1");
  });

  it("does not show a re-extract action for completed documents", () => {
    render(<DocumentRowActions doc={makeDocument({ status: "completed" })} onDelete={vi.fn()} onReExtract={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Re-extract this document" })).toBeNull();
  });

  it("disables the re-extract action while that document is re-extracting", () => {
    render(
      <DocumentRowActions
        doc={makeDocument({ status: "failed" })}
        onDelete={vi.fn()}
        onReExtract={vi.fn()}
        reExtractingId="doc-1"
      />,
    );
    expect(screen.getByRole("button", { name: "Re-extract this document" })).toBeDisabled();
  });

  it("renders a delete action that calls onDelete", () => {
    const onDelete = vi.fn();
    render(<DocumentRowActions doc={makeDocument()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete document" }));
    expect(onDelete).toHaveBeenCalledWith("doc-1");
  });

  it("renders an escrow toggle that calls onToggleEscrow with the current value", () => {
    const onToggleEscrow = vi.fn();
    render(<DocumentRowActions doc={makeDocument({ is_escrow_paid: true })} onDelete={vi.fn()} onToggleEscrow={onToggleEscrow} />);
    fireEvent.click(screen.getByRole("button", { name: "Unmark as reference-only" }));
    expect(onToggleEscrow).toHaveBeenCalledWith("doc-1", true);
  });

  it("uses >=44px touch targets in comfortable (mobile) mode", () => {
    render(<DocumentRowActions doc={makeDocument({ status: "failed" })} onDelete={vi.fn()} onReExtract={vi.fn()} comfortable />);
    const btn = screen.getByRole("button", { name: "Re-extract this document" });
    // h-11/w-11 = 44px in Tailwind's default scale.
    expect(btn.className).toContain("h-11");
    expect(btn.className).toContain("w-11");
  });
});
