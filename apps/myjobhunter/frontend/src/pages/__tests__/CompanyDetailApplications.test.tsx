import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CompanyDetail from "@/pages/CompanyDetail";
import { columnValues, sortTableBy } from "@/test-utils/sortTableBy";

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useGetCompanyQuery: vi.fn(),
  useDeleteCompanyMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));
vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useListApplicationsQuery: vi.fn(),
}));
vi.mock("@/features/companies/CompanyResearchPanel", () => ({ default: () => null }));

import { useGetCompanyQuery } from "@myjobhunter/api-client/store/companiesApi";
import { useListApplicationsQuery } from "@myjobhunter/api-client/store/applicationsApi";

const COMPANY = { id: "c1", name: "Acme Corp", primary_domain: null, industry: null, size_range: null, hq_location: null, description: null };

// The server's order; the role tells the rows apart.
const APPLICATIONS = [
  { id: "a1", role_title: "Not sent", location: null, remote_type: "unknown", applied_at: null },
  { id: "a2", role_title: "October", location: null, remote_type: "remote", applied_at: "2026-10-02T00:00:00Z" },
  { id: "a3", role_title: "Blank", location: null, remote_type: "unknown", applied_at: "" },
  { id: "a4", role_title: "September", location: null, remote_type: "onsite", applied_at: "2026-09-30T00:00:00Z" },
  { id: "a5", role_title: "Last year", location: null, remote_type: "hybrid", applied_at: "2025-12-01T00:00:00Z" },
];

function renderCompany() {
  vi.mocked(useGetCompanyQuery).mockReturnValue({ data: COMPANY, isLoading: false, isError: false } as unknown as ReturnType<typeof useGetCompanyQuery>);
  vi.mocked(useListApplicationsQuery).mockReturnValue({
    data: { items: APPLICATIONS, total: APPLICATIONS.length },
  } as unknown as ReturnType<typeof useListApplicationsQuery>);
  render(
    <MemoryRouter initialEntries={["/companies/c1"]}>
      <Routes>
        <Route path="/companies/:id" element={<CompanyDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CompanyDetail applications table", () => {
  it("shows the applied date in the reader's locale, and a dash when not sent", () => {
    renderCompany();

    expect(screen.getByText(new Date("2026-10-02T00:00:00Z").toLocaleDateString())).toBeInTheDocument();
    expect(columnValues(3)[0]).toBe("—");
  });

  it("sorts Applied on the real date with not-yet-applied last, both ways", () => {
    renderCompany();

    sortTableBy(/applied/i, "ascending");
    expect(columnValues(0)).toEqual(["Last year", "September", "October", "Not sent", "Blank"]);

    sortTableBy(/applied/i, "descending");
    expect(columnValues(0)).toEqual(["October", "September", "Last year", "Not sent", "Blank"]);
  });
});
