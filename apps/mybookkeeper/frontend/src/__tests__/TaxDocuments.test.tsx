import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import TaxDocuments from "@/app/pages/TaxDocuments";
import type { SourceDocumentsResponse } from "@/shared/types/tax/source-document";
import type { TaxReturn } from "@/shared/types/tax/tax-return";

const mockDocumentsData: SourceDocumentsResponse = {
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
      reason: "Mortgage interest transactions exist for 123 Main St",
      status: "missing",
      document_id: null,
    },
  ],
};

const emptyData: SourceDocumentsResponse = { documents: [], checklist: [] };

const mockTaxReturns: TaxReturn[] = [
  {
    id: "tr-1",
    organization_id: "org-1",
    tax_year: 2025,
    filing_status: "single",
    jurisdiction: "federal",
    status: "draft",
    needs_recompute: false,
    filed_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "tr-2",
    organization_id: "org-1",
    tax_year: 2024,
    filing_status: "single",
    jurisdiction: "federal",
    status: "filed",
    needs_recompute: false,
    filed_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

vi.mock("@/shared/store/taxReturnsApi", async () => {
  const actual = await vi.importActual("@/shared/store/taxReturnsApi");
  return {
    ...actual,
    useListTaxDocumentsQuery: vi.fn(() => ({
      data: mockDocumentsData,
      isLoading: false,
      isError: false,
    })),
    useListTaxReturnsQuery: vi.fn(() => ({
      data: mockTaxReturns,
    })),
  };
});

vi.mock("@/app/features/documents/DocumentViewer", () => ({
  default: ({ onClose }: { documentId: string; onClose: () => void }) => (
    <div data-testid="document-viewer">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

import {
  useListTaxDocumentsQuery,
  useListTaxReturnsQuery,
} from "@/shared/store/taxReturnsApi";

function renderPage() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <TaxDocuments />
      </MemoryRouter>
    </Provider>,
  );
}

describe("TaxDocuments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useListTaxDocumentsQuery).mockReturnValue({
      data: mockDocumentsData,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useListTaxDocumentsQuery>);
    vi.mocked(useListTaxReturnsQuery).mockReturnValue({
      data: mockTaxReturns,
    } as unknown as ReturnType<typeof useListTaxReturnsQuery>);
  });

  it("renders skeleton when loading", () => {
    vi.mocked(useListTaxDocumentsQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useListTaxDocumentsQuery>);

    const { container } = renderPage();
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders empty state when no documents", () => {
    vi.mocked(useListTaxDocumentsQuery).mockReturnValue({
      data: emptyData,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useListTaxDocumentsQuery>);

    renderPage();
    expect(screen.getByText("No tax documents yet")).toBeInTheDocument();
  });

  it("renders error state on query failure", () => {
    vi.mocked(useListTaxDocumentsQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useListTaxDocumentsQuery>);

    renderPage();
    expect(
      screen.getByText("I had trouble loading your tax documents. Please try refreshing."),
    ).toBeInTheDocument();
  });

  it("renders year group in accordion layout", () => {
    renderPage();
    expect(screen.getByText("2025")).toBeInTheDocument();
  });

  it("renders document count", () => {
    renderPage();
    expect(screen.getByText(/2 document/)).toBeInTheDocument();
  });

  it("renders issuer names from documents", () => {
    renderPage();
    expect(screen.getByText("Vello LLC")).toBeInTheDocument();
    const airbnbElements = screen.getAllByText("Airbnb");
    expect(airbnbElements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders key amounts in currency format", () => {
    renderPage();
    expect(screen.getByText("$45,724.88")).toBeInTheDocument();
    expect(screen.getByText("$15,000.00")).toBeInTheDocument();
  });

  it("renders form type badges", () => {
    renderPage();
    expect(screen.getByText("1099-MISC")).toBeInTheDocument();
    const k1099Elements = screen.getAllByText("1099-K");
    expect(k1099Elements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders a View button for each document", () => {
    renderPage();
    const viewButtons = screen.getAllByText("View");
    expect(viewButtons.length).toBe(2);
  });

  it("renders the document checklist section", () => {
    renderPage();
    expect(screen.getByText("Document Checklist")).toBeInTheDocument();
    expect(screen.getByText("1 received, 1 missing")).toBeInTheDocument();
  });

  it("renders Upload link for missing checklist items", () => {
    renderPage();
    const uploadElements = screen.getAllByText("Upload");
    expect(uploadElements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders checklist reason text", () => {
    renderPage();
    expect(screen.getByText("Reservations found on Airbnb platform")).toBeInTheDocument();
    expect(screen.getByText("Mortgage interest transactions exist for 123 Main St")).toBeInTheDocument();
  });

  it("year selector shows available years from tax returns", () => {
    renderPage();
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    const options = select.querySelectorAll("option");
    const yearValues = Array.from(options).map((o) => o.textContent);
    expect(yearValues).toContain("2025");
    expect(yearValues).toContain("2024");
  });

  it("year selector shows All Years as the default option", () => {
    renderPage();
    const select = screen.getByRole("combobox");
    const firstOption = select.querySelectorAll("option")[0];
    expect(firstOption?.textContent).toBe("All Years");
    expect((select as HTMLSelectElement).value).toBe("");
  });

  it("year selector is hidden when no tax returns exist", () => {
    vi.mocked(useListTaxReturnsQuery).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useListTaxReturnsQuery>);

    renderPage();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("opens document viewer when View button is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    const viewButtons = screen.getAllByText("View");
    await user.click(viewButtons[0]);

    expect(screen.getByTestId("document-viewer")).toBeInTheDocument();
  });

  it("closes document viewer when Close is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    const viewButtons = screen.getAllByText("View");
    await user.click(viewButtons[0]);
    expect(screen.getByTestId("document-viewer")).toBeInTheDocument();

    await user.click(screen.getByText("Close"));
    expect(screen.queryByTestId("document-viewer")).not.toBeInTheDocument();
  });

  it("renders section header with Tax Documents title", () => {
    renderPage();
    expect(screen.getByText("Tax Documents")).toBeInTheDocument();
  });
});
