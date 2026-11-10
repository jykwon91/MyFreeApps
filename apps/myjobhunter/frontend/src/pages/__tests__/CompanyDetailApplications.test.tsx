import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CompanyDetail from "@/pages/CompanyDetail";
import { applicationsListResult } from "@/test-utils/applicationsListResult";
import { columnValues, sortTableBy } from "@/test-utils/sortTableBy";

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useGetCompanyQuery: vi.fn(),
  useDeleteCompanyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));
vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useListApplicationsInfiniteQuery: vi.fn(),
}));
vi.mock("@/features/companies/CompanyResearchPanel", () => ({ default: () => null }));

import { useGetCompanyQuery } from "@myjobhunter/api-client/store/companiesApi";
import { useListApplicationsInfiniteQuery } from "@myjobhunter/api-client/store/applicationsApi";
import type { Application } from "@myjobhunter/api-client/types/application";

const COMPANY = { id: "c1", name: "Acme Corp", primary_domain: null, industry: null, size_range: null, hq_location: null, description: null };

// The server's order (newest applied first, not-yet-applied last); the role
// tells the rows apart.
const APPLICATIONS = [
  { id: "a2", role_title: "October", location: null, remote_type: "remote", applied_at: "2026-10-02T00:00:00Z" },
  { id: "a4", role_title: "September", location: null, remote_type: "onsite", applied_at: "2026-09-30T00:00:00Z" },
  { id: "a5", role_title: "Last year", location: null, remote_type: "hybrid", applied_at: "2025-12-01T00:00:00Z" },
  { id: "a1", role_title: "Not sent", location: null, remote_type: "unknown", applied_at: null },
  { id: "a3", role_title: "Blank", location: null, remote_type: "unknown", applied_at: "" },
] as unknown as Application[];

const mockList = vi.mocked(useListApplicationsInfiniteQuery);

function renderCompany(total = APPLICATIONS.length, hasNextPage = false) {
  vi.mocked(useGetCompanyQuery).mockReturnValue({ data: COMPANY, isLoading: false, isError: false } as unknown as ReturnType<typeof useGetCompanyQuery>);
  mockList.mockReturnValue(applicationsListResult({ page: { items: APPLICATIONS, total }, hasNextPage }));
  render(
    <MemoryRouter initialEntries={["/companies/c1"]}>
      <Routes>
        <Route path="/companies/:id" element={<CompanyDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CompanyDetail applications table", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks the server for this company's applications only, in the default order", () => {
    renderCompany();
    expect(mockList).toHaveBeenLastCalledWith({ company_id: "c1", sort: "applied", order: "desc" }, { skip: false });
  });

  it("shows the server's order, with Applied marked as the sort it's in", () => {
    renderCompany();

    expect(columnValues(0)).toEqual(["October", "September", "Last year", "Not sent", "Blank"]);
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(4);
    expect(screen.getByRole("columnheader", { name: /applied/i })).toHaveAttribute("aria-sort", "descending");
    for (const header of headers.filter((h) => !/applied/i.test(h.textContent ?? ""))) {
      expect(header).toHaveAttribute("aria-sort", "none");
    }
  });

  it("shows the applied date in the reader's locale, and a dash when not sent", () => {
    renderCompany();

    expect(screen.getByText(new Date("2026-10-02T00:00:00Z").toLocaleDateString())).toBeInTheDocument();
    expect(columnValues(3)[3]).toBe("—");
  });

  it("sorts on the server, both ways, keeping the rows in the order it sends", () => {
    renderCompany();

    sortTableBy(/applied/i, "ascending");
    expect(mockList.mock.lastCall?.[0]).toEqual({ company_id: "c1", sort: "applied", order: "asc" });
    sortTableBy(/role/i, "descending");
    expect(mockList.mock.lastCall?.[0]).toEqual({ company_id: "c1", sort: "role", order: "desc" });
    expect(columnValues(0)).toEqual(["October", "September", "Last year", "Not sent", "Blank"]);
  });

  it("counts every application at the company, not just the loaded page, and loads more", () => {
    renderCompany(60, true);

    expect(screen.getByRole("heading", { name: /Applications at Acme Corp \(60\)/ })).toBeInTheDocument();
    expect(screen.getByText("Showing 5 of 60 applications")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    const result = mockList.mock.results[mockList.mock.results.length - 1]?.value as ReturnType<typeof useListApplicationsInfiniteQuery>;
    expect(result.fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

describe("CompanyDetail applications before they load", () => {
  beforeEach(() => vi.clearAllMocks());

  function renderWith(result: ReturnType<typeof applicationsListResult>) {
    vi.mocked(useGetCompanyQuery).mockReturnValue({ data: COMPANY, isLoading: false, isError: false } as unknown as ReturnType<typeof useGetCompanyQuery>);
    mockList.mockReturnValue(result);
    render(
      <MemoryRouter initialEntries={["/companies/c1"]}>
        <Routes>
          <Route path="/companies/:id" element={<CompanyDetail />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  const deleteButton = () => screen.getByRole("button", { name: "Delete" });

  it("shows a skeleton with the table's columns while loading, never the empty message, and Delete waits", () => {
    renderWith(applicationsListResult({ isLoading: true }));

    const skeleton = screen.getByLabelText("Loading applications at this company");
    expect(within(skeleton).getAllByRole("columnheader")).toHaveLength(4);
    expect(skeleton.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
    expect(screen.queryByText("No applications at this company yet.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Applications at Acme Corp" })).toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();
    expect(deleteButton()).toHaveAttribute("title", "Checking this company's applications before it can be deleted.");
  });

  it("shows an error with Try again when the list fails, keeping Delete disabled, and retries", () => {
    renderWith(applicationsListResult({ isError: true, error: { status: 500 } }));

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load this company's applications.");
    expect(screen.queryByText("No applications at this company yet.")).toBeNull();
    expect(deleteButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const result = mockList.mock.results[mockList.mock.results.length - 1]?.value as ReturnType<typeof useListApplicationsInfiniteQuery>;
    expect(result.refetch).toHaveBeenCalledTimes(1);
  });

  it("enables Delete once the list has loaded and is empty", () => {
    renderWith(applicationsListResult({ page: { items: [], total: 0 } }));

    expect(screen.getByText("No applications at this company yet.")).toBeInTheDocument();
    expect(deleteButton()).toBeEnabled();
    expect(deleteButton()).not.toHaveAttribute("title");
  });
});
