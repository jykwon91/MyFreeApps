import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Applications from "@/pages/Applications";
import { applicationsListResult } from "@/test-utils/applicationsListResult";
import { columnValues, sortTableBy } from "@/test-utils/sortTableBy";

// ---------------------------------------------------------------------------
// Mock RTK Query hooks
// ---------------------------------------------------------------------------

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useListApplicationsInfiniteQuery: vi.fn(),
  useCreateApplicationMutation: vi.fn(),
  useParseJobDescriptionMutation: vi.fn(),
  useExtractJdFromUrlMutation: vi.fn(),
}));

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
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
  useListApplicationsInfiniteQuery,
  useCreateApplicationMutation,
  useParseJobDescriptionMutation,
  useExtractJdFromUrlMutation,
} from "@myjobhunter/api-client/store/applicationsApi";
import {
  useListCompaniesQuery,
  useCreateCompanyMutation,
  useTriggerCompanyResearchMutation,
} from "@myjobhunter/api-client/store/companiesApi";

const mockUseListApplications = vi.mocked(useListApplicationsInfiniteQuery);
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
  applied_at: string | null;
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
    applied_at: overrides.applied_at === undefined ? "2026-01-15T00:00:00Z" : overrides.applied_at,
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
      mockUseListApplications.mockReturnValue(applicationsListResult({ isLoading: true }));

      renderApplications();

      expect(screen.getByLabelText("Loading applications")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("renders the error message with status code", () => {
      mockUseListApplications.mockReturnValue(applicationsListResult({ isError: true, error: { status: 503 } }));

      renderApplications();

      expect(screen.getByText(/The server returned 503/i)).toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("renders the empty state heading when there are no applications", () => {
      mockUseListApplications.mockReturnValue(applicationsListResult({ page: { items: [], total: 0 } }));

      renderApplications();

      expect(
        screen.getByRole("heading", { name: "No applications yet" }),
      ).toBeInTheDocument();
    });
  });

  describe("loaded state — Status column", () => {
    it("renders a Status badge for an app with latest_status='applied'", () => {
      mockUseListApplications.mockReturnValue(applicationsListResult({ page: {
          items: [makeApp({ latest_status: "applied" })],
          total: 1,
        } }));

      renderApplications();

      // "Applied" also appears as a column header for the applied_at date column;
      // scope to the table cell to avoid "found multiple elements" from getByText.
      expect(screen.getByRole("cell", { name: "Applied" })).toBeInTheDocument();
    });

    it("renders a Status badge for an app with latest_status='interview_scheduled'", () => {
      mockUseListApplications.mockReturnValue(applicationsListResult({ page: {
          items: [makeApp({ latest_status: "interview_scheduled" })],
          total: 1,
        } }));

      renderApplications();

      expect(screen.getByText("Interview scheduled")).toBeInTheDocument();
    });

    it("renders a Status badge for an app with latest_status='offer_received'", () => {
      mockUseListApplications.mockReturnValue(applicationsListResult({ page: {
          items: [makeApp({ latest_status: "offer_received" })],
          total: 1,
        } }));

      renderApplications();

      expect(screen.getByText("Offer received")).toBeInTheDocument();
    });

    it("renders a Status badge for an app with latest_status='rejected'", () => {
      mockUseListApplications.mockReturnValue(applicationsListResult({ page: {
          items: [makeApp({ latest_status: "rejected" })],
          total: 1,
        } }));

      renderApplications();

      expect(screen.getByText("Rejected")).toBeInTheDocument();
    });

    it("renders an em-dash for an app with latest_status=null", () => {
      mockUseListApplications.mockReturnValue(applicationsListResult({ page: {
          items: [makeApp({ latest_status: null })],
          total: 1,
        } }));

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

      mockUseListApplications.mockReturnValue(applicationsListResult({ page: { items, total: 3 } }));

      renderApplications();

      expect(screen.getByRole("cell", { name: "Applied" })).toBeInTheDocument();
      expect(screen.getByText("Rejected")).toBeInTheDocument();
      // The null row contributes at least one "—"
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("renders the Status column header", () => {
      mockUseListApplications.mockReturnValue(applicationsListResult({ page: {
          items: [makeApp({ latest_status: "applied" })],
          total: 1,
        } }));

      renderApplications();

      expect(screen.getByRole("columnheader", { name: /status/i })).toBeInTheDocument();
    });

    it("renders the Company column with the company_name value", () => {
      mockUseListApplications.mockReturnValue(applicationsListResult({ page: {
          items: [makeApp({ latest_status: "applied", company_name: "Stripe" })],
          total: 1,
        } }));

      renderApplications();

      expect(screen.getByRole("columnheader", { name: /company/i })).toBeInTheDocument();
      expect(screen.getByRole("cell", { name: "Stripe" })).toBeInTheDocument();
    });

    it("renders an em-dash in the Company cell when company_name is null", () => {
      mockUseListApplications.mockReturnValue(applicationsListResult({ page: {
          items: [makeApp({ latest_status: "applied", company_name: null })],
          total: 1,
        } }));

      renderApplications();

      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });

    it("renders unknown event type with neutral badge text (no crash)", () => {
      mockUseListApplications.mockReturnValue(applicationsListResult({ page: {
          items: [makeApp({ latest_status: "phone_screen" })],
          total: 1,
        } }));

      renderApplications();

      // formatEventType falls back to capitalize + replace underscores
      expect(screen.getByText("Phone screen")).toBeInTheDocument();
    });
  });

  describe("sorting", () => {
    // The server's order (newest applied first, not-yet-applied last); the
    // company name tells the rows apart.
    const apps = [
      makeApp({ id: "a", company_name: "NoStatus", latest_status: null, applied_at: "2026-10-02T00:00:00Z" }),
      makeApp({ id: "c", company_name: "Applied", latest_status: "applied", applied_at: "2026-09-30T00:00:00Z" }),
      makeApp({ id: "d", company_name: "Interview", latest_status: "interview_scheduled", applied_at: "2025-12-01T00:00:00Z" }),
      makeApp({ id: "b", company_name: "Offer", latest_status: "offer_received", applied_at: null }),
    ];

    beforeEach(() => {
      mockUseListApplications.mockReturnValue(applicationsListResult({ page: { items: apps, total: apps.length } }));
    });

    function lastSortRequested() {
      return mockUseListApplications.mock.lastCall?.[0];
    }

    it("shows the server's order, with Applied marked as the sort it's in", () => {
      renderApplications();

      expect(columnValues(0)).toEqual(["NoStatus", "Applied", "Interview", "Offer"]);
      const headers = screen.getAllByRole("columnheader");
      expect(headers).toHaveLength(7);
      for (const header of headers) {
        const expected = /^applied/i.test(header.textContent ?? "") ? "descending" : "none";
        expect(header).toHaveAttribute("aria-sort", expected);
      }
    });

    it("opens in the server's default order, applied most recently first", () => {
      renderApplications();
      expect(lastSortRequested()).toEqual({ sort: "applied", order: "desc" });
    });

    it("asks the server for each column's sort, both ways, and shows the rows in the order it sends", () => {
      renderApplications();
      const columns: [RegExp, string][] = [
        [/company/i, "company"],
        [/role/i, "role"],
        [/status/i, "status"],
        [/location/i, "location"],
        [/remote/i, "remote"],
        [/^applied/i, "applied"],
        [/fit/i, "fit"],
      ];
      for (const [header, field] of columns) {
        sortTableBy(header, "ascending");
        expect(lastSortRequested()).toEqual({ sort: field, order: "asc" });
        sortTableBy(header, "descending");
        expect(lastSortRequested()).toEqual({ sort: field, order: "desc" });
      }
      // Never re-sorted in the browser: the server already put missing values last.
      expect(columnValues(0)).toEqual(["NoStatus", "Applied", "Interview", "Offer"]);
    });

    it("shows skeleton rows under the headers while a new sort loads", () => {
      mockUseListApplications.mockReturnValue(
        applicationsListResult({ page: { items: apps, total: apps.length }, isStale: true }),
      );
      renderApplications();

      expect(screen.getByRole("columnheader", { name: /company/i })).toBeInTheDocument();
      expect(screen.queryByRole("cell", { name: "Offer" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "No applications yet" })).toBeNull();
    });
  });

  describe("paging", () => {
    const first = [makeApp({ id: "p1", company_name: "One" }), makeApp({ id: "p2", company_name: "Two" })];
    const second = [makeApp({ id: "p3", company_name: "Three" })];

    it("shows every loaded page and how many there are in all, with Load more", () => {
      mockUseListApplications.mockReturnValue(
        applicationsListResult({ pages: [{ items: first, total: 5 }, { items: second, total: 5 }], hasNextPage: true }),
      );
      renderApplications();

      expect(columnValues(0)).toEqual(["One", "Two", "Three"]);
      expect(screen.getByText("Showing 3 of 5 applications")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
    });

    it("loads the next page on Load more, showing it's busy meanwhile", () => {
      const fetchNextPage = vi.fn(() => Promise.resolve({ isError: false }));
      mockUseListApplications.mockReturnValue(
        applicationsListResult({ page: { items: first, total: 5 }, hasNextPage: true, fetchNextPage }),
      );
      const { rerender } = renderApplications();

      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      expect(fetchNextPage).toHaveBeenCalledTimes(1);

      mockUseListApplications.mockReturnValue(
        applicationsListResult({ page: { items: first, total: 5 }, hasNextPage: true, isFetchingNextPage: true }),
      );
      rerender(
        <MemoryRouter initialEntries={["/applications"]}>
          <Routes>
            <Route path="/applications" element={<Applications />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByRole("button", { name: /loading more/i })).toBeDisabled();
    });

    it("keeps the loaded rows and offers Try again when the next page fails", () => {
      const fetchNextPage = vi.fn(() => Promise.resolve({ isError: false }));
      mockUseListApplications.mockReturnValue(
        applicationsListResult({ page: { items: first, total: 5 }, hasNextPage: true, isError: true, direction: "forward", fetchNextPage }),
      );
      renderApplications();

      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load more applications.");
      expect(columnValues(0)).toEqual(["One", "Two"]);
      expect(screen.queryByText("Couldn't load applications")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    it("drops the next-page error once a later load works, such as a background refresh", () => {
      mockUseListApplications.mockReturnValue(
        applicationsListResult({ page: { items: first, total: 5 }, hasNextPage: true, isError: true, direction: "forward" }),
      );
      const { rerender } = renderApplications();
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load more applications.");

      // A refetch (direction cleared) succeeded.
      mockUseListApplications.mockReturnValue(applicationsListResult({ page: { items: first, total: 5 }, hasNextPage: true }));
      rerender(
        <MemoryRouter initialEntries={["/applications"]}>
          <Routes>
            <Route path="/applications" element={<Applications />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
    });

    it("ignores Load more while the list is already fetching", () => {
      const fetchNextPage = vi.fn(() => Promise.resolve({ isError: false }));
      mockUseListApplications.mockReturnValue(
        applicationsListResult({ page: { items: first, total: 5 }, hasNextPage: true, isFetching: true, fetchNextPage }),
      );
      renderApplications();

      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      expect(fetchNextPage).not.toHaveBeenCalled();
    });

    it("has no Load more once every application is loaded", () => {
      mockUseListApplications.mockReturnValue(applicationsListResult({ page: { items: first, total: 2 } }));
      renderApplications();
      expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
      expect(screen.queryByText(/^Showing/)).toBeNull();
    });
  });
});
