import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Companies from "@/pages/Companies";
import { columnValues, sortTableBy } from "@/test-utils/sortTableBy";

// ---------------------------------------------------------------------------
// Mock RTK Query hooks — all state is controlled per-test via mockReturnValue.
// ---------------------------------------------------------------------------

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useListCompaniesQuery: vi.fn(),
  useGetCompanyQuery: vi.fn(),
  useCreateCompanyMutation: vi.fn(),
  useUpdateCompanyMutation: vi.fn(),
  useDeleteCompanyMutation: vi.fn(),
}));

// Suppress radix-dialog portal errors in jsdom.
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
  };
});

import {
  useListCompaniesQuery,
  useCreateCompanyMutation,
} from "@myjobhunter/api-client/store/companiesApi";

const mockUseListCompaniesQuery = vi.mocked(useListCompaniesQuery);
const mockUseCreateCompanyMutation = vi.mocked(useCreateCompanyMutation);

// A minimal mutation tuple that satisfies the hook's return type.
const stubMutation = [vi.fn(), { isLoading: false }] as unknown as ReturnType<typeof useCreateCompanyMutation>;

function renderCompanies() {
  return render(
    <MemoryRouter initialEntries={["/companies"]}>
      <Routes>
        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/:id" element={<div>Detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Companies page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateCompanyMutation.mockReturnValue(stubMutation);
  });

  describe("loading state", () => {
    it("renders the skeleton while loading", () => {
      mockUseListCompaniesQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListCompaniesQuery>);

      renderCompanies();

      // The skeleton table should be visible with an aria-busy label.
      expect(screen.getByLabelText("Loading companies")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("renders the error empty state when the query fails with an HTTP status", () => {
      mockUseListCompaniesQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: { status: 500 },
      } as unknown as ReturnType<typeof useListCompaniesQuery>);

      renderCompanies();

      expect(
        screen.getByText(/The server returned 500/i),
      ).toBeInTheDocument();
    });

    it("renders a generic error message when no status is available", () => {
      mockUseListCompaniesQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("network error"),
      } as unknown as ReturnType<typeof useListCompaniesQuery>);

      renderCompanies();

      expect(screen.getByText(/Try refreshing the page/i)).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("renders the empty state heading and body when there are no companies", () => {
      mockUseListCompaniesQuery.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListCompaniesQuery>);

      renderCompanies();

      expect(
        screen.getByRole("heading", { name: "No companies here yet" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/I'll add companies here as you log applications/),
      ).toBeInTheDocument();
    });

    it("renders an 'Add a company' CTA in the empty state", () => {
      mockUseListCompaniesQuery.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListCompaniesQuery>);

      renderCompanies();

      expect(
        screen.getByRole("button", { name: /add a company/i }),
      ).toBeInTheDocument();
    });
  });

  describe("loaded state", () => {
    const items = [
      {
        id: "c1",
        user_id: "u1",
        name: "Acme Corp",
        primary_domain: "acme.com",
        industry: "SaaS",
        hq_location: "San Francisco, CA",
        logo_url: null,
        size_range: null,
        description: null,
        external_ref: null,
        external_source: null,
        crunchbase_id: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "c2",
        user_id: "u1",
        name: "Beta LLC",
        primary_domain: null,
        industry: null,
        hq_location: null,
        logo_url: null,
        size_range: null,
        description: null,
        external_ref: null,
        external_source: null,
        crunchbase_id: null,
        created_at: "2026-01-02T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
      },
    ];

    beforeEach(() => {
      mockUseListCompaniesQuery.mockReturnValue({
        data: { items, total: 2 },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListCompaniesQuery>);
    });

    it("renders the Companies heading", () => {
      renderCompanies();
      expect(screen.getByRole("heading", { name: "Companies" })).toBeInTheDocument();
    });

    it("renders all company names", () => {
      renderCompanies();
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
      expect(screen.getByText("Beta LLC")).toBeInTheDocument();
    });

    it("renders domains when present or dash when null", () => {
      renderCompanies();
      expect(screen.getByText("acme.com")).toBeInTheDocument();
      // Beta LLC has no domain — cell should show "—"
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("renders an 'Add company' button in the header", () => {
      renderCompanies();
      expect(
        screen.getByRole("button", { name: /add company/i }),
      ).toBeInTheDocument();
    });
  });

  describe("sorting", () => {
    function company(
      id: string,
      name: string,
      primaryDomain: string | null,
      industry: string | null,
      hqLocation: string | null,
    ) {
      return {
        id,
        user_id: "u1",
        name,
        primary_domain: primaryDomain,
        industry,
        hq_location: hqLocation,
        logo_url: null,
        size_range: null,
        description: null,
        external_ref: null,
        external_source: null,
        crunchbase_id: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };
    }

    // The server's order (name A to Z). Each company is missing a different
    // field; Umbrella's domain is blank, which counts as missing too.
    const items = [
      company("c1", "Acme Corp", "acme.com", "SaaS", "Chicago, IL"),
      company("c2", "Globex", null, null, "Austin, TX"),
      company("c3", "Initech", "initech.com", "Fintech", null),
      company("c4", "Umbrella", "", "Biotech", "Boston, MA"),
    ];

    beforeEach(() => {
      mockUseListCompaniesQuery.mockReturnValue({
        data: { items, total: items.length },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListCompaniesQuery>);
    });

    it("shows the server's order with every header unsorted", () => {
      renderCompanies();
      expect(columnValues(0)).toEqual(["Acme Corp", "Globex", "Initech", "Umbrella"]);
      const headers = screen.getAllByRole("columnheader");
      expect(headers).toHaveLength(4);
      for (const header of headers) {
        expect(header).toHaveAttribute("aria-sort", "none");
      }
    });

    it("sorts by Name when its header is clicked, both ways", () => {
      renderCompanies();

      sortTableBy(/name/i, "descending");
      expect(columnValues(0)).toEqual(["Umbrella", "Initech", "Globex", "Acme Corp"]);

      sortTableBy(/name/i, "ascending");
      expect(columnValues(0)).toEqual(["Acme Corp", "Globex", "Initech", "Umbrella"]);
    });

    it("sorts Industry with missing last, both ways, still showing a dash", () => {
      renderCompanies();

      sortTableBy(/industry/i, "ascending");
      expect(columnValues(2)).toEqual(["Biotech", "Fintech", "SaaS", "—"]);
      expect(screen.getByRole("columnheader", { name: /name/i })).toHaveAttribute("aria-sort", "none");

      sortTableBy(/industry/i, "descending");
      expect(columnValues(2)).toEqual(["SaaS", "Fintech", "Biotech", "—"]);
    });

    it("sorts HQ with missing last, both ways", () => {
      renderCompanies();

      sortTableBy(/hq/i, "ascending");
      expect(columnValues(3)).toEqual(["Austin, TX", "Boston, MA", "Chicago, IL", "—"]);

      sortTableBy(/hq/i, "descending");
      expect(columnValues(3)).toEqual(["Chicago, IL", "Boston, MA", "Austin, TX", "—"]);
    });

    it("sorts accented and numbered names as the phone does, not by character code", () => {
      // Without the shared comparator the table would sort "Éclair" after "Studio" and, by
      // first-ten-rows guesswork, could put "Studio 10" before "Studio 9".
      const tricky = [
        company("t1", "Studio 10", null, "Studio 10", null),
        company("t2", "Éclair", null, "Éclair", null),
        company("t3", "beta", null, "beta", null),
        company("t4", "Studio 9", null, "Studio 9", null),
      ];
      mockUseListCompaniesQuery.mockReturnValue({
        data: { items: tricky, total: tricky.length },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListCompaniesQuery>);
      renderCompanies();

      sortTableBy(/name/i, "ascending");
      expect(columnValues(0)).toEqual(["beta", "Éclair", "Studio 9", "Studio 10"]);
      sortTableBy(/name/i, "descending");
      expect(columnValues(0)).toEqual(["Studio 10", "Studio 9", "Éclair", "beta"]);

      sortTableBy(/industry/i, "ascending");
      expect(columnValues(2)).toEqual(["beta", "Éclair", "Studio 9", "Studio 10"]);
    });

    it("sorts Domain with null and blank domains last, both ways", () => {
      renderCompanies();

      sortTableBy(/domain/i, "ascending");
      expect(columnValues(0)).toEqual(["Acme Corp", "Initech", "Globex", "Umbrella"]);
      expect(columnValues(1)).toEqual(["acme.com", "initech.com", "—", "—"]);

      sortTableBy(/domain/i, "descending");
      expect(columnValues(0)).toEqual(["Initech", "Acme Corp", "Globex", "Umbrella"]);
    });
  });
});
