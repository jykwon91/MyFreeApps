/** The company line on an application page: a skeleton while it loads, a retry when it can't. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ApplicationDetail from "@/pages/ApplicationDetail";

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useGetApplicationQuery: () => ({
    data: { id: "a1", company_id: "c1", role_title: "Staff Engineer", remote_type: "unknown", archived: false, events: [], contacts: [] },
    isLoading: false,
  }),
  useDeleteApplicationMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateApplicationMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({ useGetCompanyQuery: vi.fn() }));
vi.mock("@/features/applications/useStageMove", () => ({
  useStageMove: () => ({ selectedColumn: "applied", isMoving: false, moveTo: vi.fn() }),
}));
vi.mock("@/features/applications/sections/OverviewSection", () => ({ default: () => null }));
vi.mock("@/features/applications/sections/EventsSection", () => ({ default: () => null }));
vi.mock("@/features/applications/sections/DocumentsSection", () => ({ default: () => null }));
vi.mock("@/features/applications/sections/NotesSection", () => ({ default: () => null }));
vi.mock("@/features/applications/contacts/ContactsManager", () => ({ default: () => null }));

import { useGetCompanyQuery } from "@myjobhunter/api-client/store/companiesApi";

function mockCompany(value: object) {
  vi.mocked(useGetCompanyQuery).mockReturnValue(value as unknown as ReturnType<typeof useGetCompanyQuery>);
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/applications/a1"]}>
      <Routes>
        <Route path="/applications/:id" element={<ApplicationDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ApplicationDetail company line", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the company name once it loads", () => {
    mockCompany({ currentData: { name: "Acme Corp" }, isError: false, refetch: vi.fn() });
    renderPage();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("shows a skeleton, not loading text, while the company loads", () => {
    mockCompany({ currentData: undefined, isError: false, refetch: vi.fn() });
    renderPage();
    expect(screen.getByLabelText("Loading the company…")).toBeInTheDocument();
    expect(screen.queryByText(/loading company/i)).not.toBeInTheDocument();
  });

  it("says the company couldn't load and retries when Try again is pressed", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    mockCompany({ currentData: undefined, isError: true, refetch });
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("I couldn't load the company.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });
});
