/** A failed refetch with the company already loaded keeps it on screen. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CompanyDetail from "@/pages/CompanyDetail";
import { applicationsListResult } from "@/test-utils/applicationsListResult";

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useGetCompanyQuery: vi.fn(),
  useDeleteCompanyMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useListApplicationsInfiniteQuery: vi.fn(),
}));
vi.mock("@/features/companies/CompanyResearchPanel", () => ({ default: () => null }));

import { useGetCompanyQuery } from "@myjobhunter/api-client/store/companiesApi";
import { useListApplicationsInfiniteQuery } from "@myjobhunter/api-client/store/applicationsApi";

const COMPANY = { id: "c1", name: "Acme Corp", primary_domain: null, industry: null, size_range: null, hq_location: null, description: null };

function renderCompany(company: object | undefined) {
  vi.mocked(useGetCompanyQuery).mockReturnValue({ data: company, isLoading: false, isError: true, error: { status: 500 } } as unknown as ReturnType<typeof useGetCompanyQuery>);
  vi.mocked(useListApplicationsInfiniteQuery).mockReturnValue(applicationsListResult({ page: { items: [], total: 0 } }));
  render(
    <MemoryRouter initialEntries={["/companies/c1"]}>
      <Routes>
        <Route path="/companies/:id" element={<CompanyDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CompanyDetail when a refetch fails", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the company on screen", () => {
    renderCompany(COMPANY);
    expect(screen.getByRole("heading", { name: "Acme Corp" })).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load that company.")).not.toBeInTheDocument();
  });

  it("still says it couldn't load when there is nothing to show", () => {
    renderCompany(undefined);
    expect(screen.getByText("Couldn't load that company.")).toBeInTheDocument();
  });
});
