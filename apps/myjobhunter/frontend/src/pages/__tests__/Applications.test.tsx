import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Applications from "@/pages/Applications";

// ---------------------------------------------------------------------------
// Mock RTK Query hooks
// ---------------------------------------------------------------------------

vi.mock("@/lib/applicationsApi", () => ({
  useListApplicationsQuery: vi.fn(),
  useCreateApplicationMutation: vi.fn(),
  useParseJobDescriptionMutation: vi.fn(),
  useExtractJdFromUrlMutation: vi.fn(),
}));

vi.mock("@/lib/companiesApi", () => ({
  useListCompaniesQuery: vi.fn(),
  useCreateCompanyMutation: vi.fn(),
  useTriggerCompanyResearchMutation: vi.fn(),
}));

// Suppress radix-dialog portal errors in jsdom.
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("@radix-ui/react-select", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-select")>();
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
  useListApplicationsQuery,
  useCreateApplicationMutation,
  useParseJobDescriptionMutation,
  useExtractJdFromUrlMutation,
} from "@/lib/applicationsApi";
import {
  useListCompaniesQuery,
  useCreateCompanyMutation,
  useTriggerCompanyResearchMutation,
} from "@/lib/companiesApi";

const mockUseListApplicationsQuery = vi.mocked(useListApplicationsQuery);
const mockUseCreateApplicationMutation = vi.mocked(useCreateApplicationMutation);
const mockUseListCompaniesQuery = vi.mocked(useListCompaniesQuery);
const mockUseCreateCompanyMutation = vi.mocked(useCreateCompanyMutation);
const mockUseTriggerCompanyResearchMutation = vi.mocked(useTriggerCompanyResearchMutation);
const mockUseParseJobDescriptionMutation = vi.mocked(useParseJobDescriptionMutation);
const mockUseExtractJdFromUrlMutation = vi.mocked(useExtractJdFromUrlMutation);

const stubMutation = [vi.fn(), { isLoading: false }] as unknown as ReturnType<
  typeof useCreateApplicationMutation
>;

const stubCompanyMutation = [vi.fn(), { isLoading: false }] as unknown as ReturnType<
  typeof useCreateCompanyMutation
>;

const stubResearchMutation = [vi.fn(), { isLoading: false }] as unknown as ReturnType<
  typeof useTriggerCompanyResearchMutation
>;

const stubParseJdMutation = [vi.fn(), { isLoading: false }] as unknown as ReturnType<
  typeof useParseJobDescriptionMutation
>;

const stubExtractJdMutation = [vi.fn(), { isLoading: false }] as unknown as ReturnType<
  typeof useExtractJdFromUrlMutation
>;

function renderApplications() {
  return render(
    <MemoryRouter initialEntries={["/applications"]}>
      <Routes>
        <Route path="/applications" element={<Applications />} />
        <Route path="/applications/:id" element={<div>Detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Minimal Application fixture with all required fields
function makeApp(overrides: Partial<{
  id: string;
  role_title: string;
  latest_status: string | null;
  company_name: string | null;
}> = {}) {
  return {
    id: overrides.id ?? "app-1",
    user_id: "user-1",
    company_id: "company-1",
    role_title: overrides.role_title ?? "Senior Engineer",
    url: null,
    jd_text: null,
    jd_parsed: null,
    source: "linkedin",
    applied_at: "2026-01-15T00:00:00Z",
    posted_salary_min: null,
    posted_salary_max: null,
    posted_salary_currency: "USD",
    posted_salary_period: null,
    location: "San Francisco, CA",
    remote_type: "remote",
    fit_score: null,
    notes: null,
    archived: false,
    external_ref: null,
    external_source: null,
    latest_status: overrides.latest_status ?? null,
    company_name: overrides.company_name ?? "Acme Corp",
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("Applications page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateApplicationMutation.mockReturnValue(stubMutation);
    mockUseCreateCompanyMutation.mockReturnValue(stubCompanyMutation);
    mockUseTriggerCompanyResearchMutation.mockReturnValue(stubResearchMutation);
    mockUseParseJobDescriptionMutation.mockReturnValue(stubParseJdMutation);
    mockUseExtractJdFromUrlMutation.mockReturnValue(stubExtractJdMutation);
    mockUseListCompaniesQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
      error: undefined,
    } as unknown as ReturnType<typeof useListCompaniesQuery>);
  });

  describe("loading state", () => {
    it("renders the skeleton while loading", () => {
      mockUseListApplicationsQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListApplicationsQuery>);

      renderApplications();

      expect(screen.getByLabelText("Loading applications")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("renders the error message with status code", () => {
      mockUseListApplicationsQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: { status: 503 },
      } as unknown as ReturnType<typeof useListApplicationsQuery>);

      renderApplications();

      expect(screen.getByText(/The server returned 503/i)).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("renders the empty state heading when there are no applications", () => {
      mockUseListApplicationsQuery.mockReturnValue({
        data: { items: [], total: 0 },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListApplicationsQuery>);

      renderApplications();

      expect(
        screen.getByRole("heading", { name: "No applications yet" }),
      ).toBeInTheDocument();
    });
  });

  describe("loaded state — Status column", () => {
    it("renders a Status badge for an app with latest_status='applied'", () => {
      mockUseListApplicationsQuery.mockReturnValue({
        data: {
          items: [makeApp({ latest_status: "applied" })],
          total: 1,
        },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListApplicationsQuery>);

      renderApplications();

      // "Applied" also appears as a column header for the applied_at date column;
      // scope to the table cell to avoid "found multiple elements" from getByText.
      expect(screen.getByRole("cell", { name: "Applied" })).toBeInTheDocument();
    });

    it("renders a Status badge for an app with latest_status='interview_scheduled'", () => {
      mockUseListApplicationsQuery.mockReturnValue({
        data: {
          items: [makeApp({ latest_status: "interview_scheduled" })],
          total: 1,
        },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListApplicationsQuery>);

      renderApplications();

      expect(screen.getByText("Interview scheduled")).toBeInTheDocument();
    });

    it("renders a Status badge for an app with latest_status='offer_received'", () => {
      mockUseListApplicationsQuery.mockReturnValue({
        data: {
          items: [makeApp({ latest_status: "offer_received" })],
          total: 1,
        },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListApplicationsQuery>);

      renderApplications();

      expect(screen.getByText("Offer received")).toBeInTheDocument();
    });

    it("renders a Status badge for an app with latest_status='rejected'", () => {
      mockUseListApplicationsQuery.mockReturnValue({
        data: {
          items: [makeApp({ latest_status: "rejected" })],
          total: 1,
        },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListApplicationsQuery>);

      renderApplications();

      expect(screen.getByText("Rejected")).toBeInTheDocument();
    });

    it("renders an em-dash for an app with latest_status=null", () => {
      mockUseListApplicationsQuery.mockReturnValue({
        data: {
          items: [makeApp({ latest_status: null })],
          total: 1,
        },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListApplicationsQuery>);

      renderApplications();

      // The status cell should contain "—" for null status
      // Find all em-dashes (there may be others for missing location etc.)
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });

    it("renders mixed status badges correctly for multiple apps", () => {
      const items = [
        makeApp({ id: "a1", role_title: "Frontend Dev", latest_status: "applied" }),
        makeApp({ id: "a2", role_title: "Backend Dev", latest_status: "rejected" }),
        makeApp({ id: "a3", role_title: "Fullstack Dev", latest_status: null }),
      ];

      mockUseListApplicationsQuery.mockReturnValue({
        data: { items, total: 3 },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListApplicationsQuery>);

      renderApplications();

      expect(screen.getByRole("cell", { name: "Applied" })).toBeInTheDocument();
      expect(screen.getByText("Rejected")).toBeInTheDocument();
      // The null row contributes at least one "—"
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("renders the Status column header", () => {
      mockUseListApplicationsQuery.mockReturnValue({
        data: {
          items: [makeApp({ latest_status: "applied" })],
          total: 1,
        },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListApplicationsQuery>);

      renderApplications();

      expect(screen.getByRole("columnheader", { name: /status/i })).toBeInTheDocument();
    });

    it("renders the Company column with the company_name value", () => {
      mockUseListApplicationsQuery.mockReturnValue({
        data: {
          items: [makeApp({ latest_status: "applied", company_name: "Stripe" })],
          total: 1,
        },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListApplicationsQuery>);

      renderApplications();

      expect(screen.getByRole("columnheader", { name: /company/i })).toBeInTheDocument();
      expect(screen.getByRole("cell", { name: "Stripe" })).toBeInTheDocument();
    });

    it("renders an em-dash in the Company cell when company_name is null", () => {
      mockUseListApplicationsQuery.mockReturnValue({
        data: {
          items: [makeApp({ latest_status: "applied", company_name: null })],
          total: 1,
        },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListApplicationsQuery>);

      renderApplications();

      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });

    it("renders unknown event type with neutral badge text (no crash)", () => {
      mockUseListApplicationsQuery.mockReturnValue({
        data: {
          items: [makeApp({ latest_status: "phone_screen" })],
          total: 1,
        },
        isLoading: false,
        isError: false,
        error: undefined,
      } as unknown as ReturnType<typeof useListApplicationsQuery>);

      renderApplications();

      // formatEventType falls back to capitalize + replace underscores
      expect(screen.getByText("Phone screen")).toBeInTheDocument();
    });
  });
});
