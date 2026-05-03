import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import SourceDocumentsSection from "@/app/features/tax/SourceDocumentsSection";
import type { SourceDocumentsResponse } from "@/shared/types/tax/source-document";

const mockSourceDocumentsData: SourceDocumentsResponse = {
  documents: [
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
  ],
  checklist: [
    {
      expected_type: "1099_k",
      expected_from: "Airbnb",
      reason: "Reservations found on Airbnb platform",
      status: "received",
      document_id: "doc-2",
    },
    {
      expected_type: "1098",
      expected_from: null,
      reason: "Mortgage interest transactions exist for 6738 Peerless",
      status: "missing",
      document_id: null,
    },
  ],
};

const emptySourceDocumentsData: SourceDocumentsResponse = {
  documents: [],
  checklist: [],
};

vi.mock("@/shared/store/taxReturnsApi", async () => {
  const actual = await vi.importActual("@/shared/store/taxReturnsApi");
  return {
    ...actual,
    useGetSourceDocumentsQuery: vi.fn(() => ({
      data: mockSourceDocumentsData,
      isLoading: false,
      isError: false,
    })),
  };
});

import { useGetSourceDocumentsQuery } from "@/shared/store/taxReturnsApi";

function renderComponent(taxReturnId: string = "tr-1") {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <SourceDocumentsSection taxReturnId={taxReturnId} />
      </MemoryRouter>
    </Provider>,
  );
}

describe("SourceDocumentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetSourceDocumentsQuery).mockReturnValue({
      data: mockSourceDocumentsData,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useGetSourceDocumentsQuery>);
  });

  it("renders received documents table with document count", () => {
    renderComponent();
    expect(screen.getByText("Received Documents (2)")).toBeInTheDocument();
  });

  it("renders document issuer names", () => {
    renderComponent();
    expect(screen.getByText("Vello LLC")).toBeInTheDocument();
    // "Airbnb" appears in both the documents table and the checklist
    const airbnbElements = screen.getAllByText("Airbnb");
    expect(airbnbElements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders form type group headers with doc counts", () => {
    renderComponent();
    // Each form type group shows a count badge
    expect(screen.getByText("1099-MISC")).toBeInTheDocument();
    const k1099Elements = screen.getAllByText("1099-K");
    expect(k1099Elements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders form type badges", () => {
    renderComponent();
    expect(screen.getByText("1099-MISC")).toBeInTheDocument();
    // "1099-K" appears in both the documents table and the checklist
    const k1099Elements = screen.getAllByText("1099-K");
    expect(k1099Elements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders View buttons for each document", () => {
    renderComponent();
    const viewButtons = screen.getAllByText("View");
    expect(viewButtons.length).toBe(2);
  });

  it("renders checklist with received and missing statuses", () => {
    renderComponent();
    expect(screen.getByText("Document Checklist")).toBeInTheDocument();
    expect(screen.getByText("1 received, 1 missing")).toBeInTheDocument();
  });

  it("renders checklist received badge", () => {
    renderComponent();
    expect(screen.getByText("Received")).toBeInTheDocument();
  });

  it("renders Upload link for missing items", () => {
    renderComponent();
    // "Upload" appears as a checklist action link for missing documents
    const uploadElements = screen.getAllByText("Upload");
    expect(uploadElements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders checklist reasons", () => {
    renderComponent();
    expect(screen.getByText("Reservations found on Airbnb platform")).toBeInTheDocument();
    expect(screen.getByText("Mortgage interest transactions exist for 6738 Peerless")).toBeInTheDocument();
  });

  it("shows empty state when no documents", () => {
    vi.mocked(useGetSourceDocumentsQuery).mockReturnValue({
      data: emptySourceDocumentsData,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useGetSourceDocumentsQuery>);

    renderComponent();
    expect(screen.getByText("I don't see any tax documents linked to this return yet.")).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    vi.mocked(useGetSourceDocumentsQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useGetSourceDocumentsQuery>);

    const { container } = renderComponent();
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows error state on failure", () => {
    vi.mocked(useGetSourceDocumentsQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useGetSourceDocumentsQuery>);

    renderComponent();
    expect(screen.getByText("I had trouble loading the source documents. Please try refreshing.")).toBeInTheDocument();
  });

  it("renders Download buttons for each document", () => {
    renderComponent();
    const downloadButtons = screen.getAllByTitle("Download document");
    expect(downloadButtons.length).toBe(2);
  });

  it("renders EIN when available", () => {
    renderComponent();
    expect(screen.getByText("EIN: 87-1674733")).toBeInTheDocument();
  });

  it("renders checklist 1098 form type badge for missing item", () => {
    renderComponent();
    // 1098 is in the checklist as a missing document
    expect(screen.getByText("1098")).toBeInTheDocument();
  });
});
