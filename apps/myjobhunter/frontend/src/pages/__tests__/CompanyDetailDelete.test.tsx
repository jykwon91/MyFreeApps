import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CompanyDetail from "@/pages/CompanyDetail";

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useGetCompanyQuery: vi.fn(),
  useDeleteCompanyMutation: vi.fn(),
  useGetCompanyResearchQuery: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  useRunCompanyResearchMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}));
vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useListApplicationsInfiniteQuery: vi.fn(),
}));
vi.mock("@/features/companies/CompanyResearchPanel", () => ({ default: () => null }));
vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, showSuccess: vi.fn(), showError: vi.fn() };
});

import { showError } from "@platform/ui";
import { useGetCompanyQuery, useDeleteCompanyMutation } from "@myjobhunter/api-client/store/companiesApi";
import { useListApplicationsInfiniteQuery } from "@myjobhunter/api-client/store/applicationsApi";
import type { Application } from "@myjobhunter/api-client/types/application";
import { applicationsListResult } from "@/test-utils/applicationsListResult";

const COMPANY = { id: "c1", name: "Acme Corp", primary_domain: null, industry: null, size_range: null, hq_location: null, description: null };

function arrange(applications: unknown[], deleteImpl: () => Promise<unknown>) {
  vi.mocked(useGetCompanyQuery).mockReturnValue({ data: COMPANY, isLoading: false, isError: false } as unknown as ReturnType<typeof useGetCompanyQuery>);
  vi.mocked(useListApplicationsInfiniteQuery).mockReturnValue(
    applicationsListResult({ page: { items: applications as Application[], total: applications.length } }),
  );
  vi.mocked(useDeleteCompanyMutation).mockReturnValue([
    () => ({ unwrap: deleteImpl }),
    { isLoading: false },
  ] as unknown as ReturnType<typeof useDeleteCompanyMutation>);
  render(
    <MemoryRouter initialEntries={["/companies/c1"]}>
      <Routes>
        <Route path="/companies/:id" element={<CompanyDetail />} />
        <Route path="/companies" element={<div>Companies list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CompanyDetail delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows the backend's coded message when the delete is refused", async () => {
    const message = "This company still has 2 applications linked to it, so it can't be deleted.";
    arrange([], () =>
      Promise.reject({ status: 409, data: { detail: { code: "COMPANY_HAS_APPLICATIONS", message, application_count: 2 } } }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(message));
    expect(screen.queryByText("Companies list")).toBeNull();
  });

  it("falls back to the generic message for other failures", async () => {
    arrange([], () => Promise.reject({ status: 500, data: { detail: "boom" } }));

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(expect.stringContaining("Couldn't delete")));
  });

  it("disables delete up front and explains why when the company has applications", () => {
    arrange([{ id: "a1", role_title: "Eng", remote_type: "unknown", applied_at: null }], () => Promise.resolve());

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getAllByText(/has applications/i).length).toBeGreaterThan(0);
  });
});
