import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReceivedDocumentsGrouped from "@/app/features/tax/ReceivedDocumentsGrouped";
import type { TaxSourceDocument } from "@/shared/types/tax/source-document";

vi.mock("@/shared/utils/downloadDocument", () => ({
  downloadDocument: vi.fn(),
}));

const mockDocuments: TaxSourceDocument[] = [
  {
    document_id: "doc-1",
    file_name: "1099-MISC-Vello.pdf",
    document_type: "1099_misc",
    issuer_name: "Vello LLC",
    issuer_ein: "87-1674733",
    tax_year: 2025,
    key_amount: 45724.88,
    source: "upload",
    uploaded_at: "2026-03-22T10:00:00Z",
    form_instance_id: "inst-1",
  },
  {
    document_id: "doc-2",
    file_name: "1099-K-Airbnb.pdf",
    document_type: "1099_k",
    issuer_name: "Airbnb",
    issuer_ein: null,
    tax_year: 2025,
    key_amount: 15000.0,
    source: "email",
    uploaded_at: "2026-03-20T08:00:00Z",
    form_instance_id: "inst-2",
  },
];

function renderComponent(
  documents: TaxSourceDocument[] = mockDocuments,
  onViewDocument = vi.fn(),
) {
  return render(
    <ReceivedDocumentsGrouped
      documents={documents}
      onViewDocument={onViewDocument}
    />,
  );
}

describe("ReceivedDocumentsGrouped", () => {
  it("renders empty state when no documents", () => {
    renderComponent([]);
    expect(
      screen.getByText("I don't see any tax documents linked to this return yet."),
    ).toBeInTheDocument();
  });

  it("renders document count header", () => {
    renderComponent();
    expect(screen.getByText("Received Documents (2)")).toBeInTheDocument();
  });

  it("renders issuer names", () => {
    renderComponent();
    expect(screen.getByText("Vello LLC")).toBeInTheDocument();
    expect(screen.getByText("Airbnb")).toBeInTheDocument();
  });

  it("renders EIN when available", () => {
    renderComponent();
    expect(screen.getByText("EIN: 87-1674733")).toBeInTheDocument();
  });

  it("renders form type badges", () => {
    renderComponent();
    expect(screen.getByText("1099-MISC")).toBeInTheDocument();
    expect(screen.getByText("1099-K")).toBeInTheDocument();
  });

  it("calls onViewDocument when View button clicked", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    renderComponent(mockDocuments, onView);

    const viewButtons = screen.getAllByText("View");
    await user.click(viewButtons[0]);
    expect(onView).toHaveBeenCalledWith("doc-1");
  });

  it("renders download buttons for each document", () => {
    renderComponent();
    const downloadButtons = screen.getAllByTitle("Download document");
    expect(downloadButtons.length).toBe(2);
  });
});
