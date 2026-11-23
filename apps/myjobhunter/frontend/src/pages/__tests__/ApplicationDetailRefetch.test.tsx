/** A failed refetch with the application already loaded keeps it on screen. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ApplicationDetail from "@/pages/ApplicationDetail";

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useGetApplicationQuery: vi.fn(),
  useDeleteApplicationMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateApplicationMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useGetCompanyQuery: () => ({ currentData: { name: "Acme Corp" }, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/features/applications/useStageMove", () => ({
  useStageMove: () => ({ selectedColumn: "applied", isMoving: false, moveTo: vi.fn() }),
}));
vi.mock("@/features/applications/sections/OverviewSection", () => ({ default: () => null }));
vi.mock("@/features/applications/sections/EventsSection", () => ({ default: () => null }));
vi.mock("@/features/applications/sections/DocumentsSection", () => ({ default: () => null }));
vi.mock("@/features/applications/sections/NotesSection", () => ({ default: () => null }));
vi.mock("@/features/applications/contacts/ContactsManager", () => ({ default: () => null }));

import { useGetApplicationQuery } from "@myjobhunter/api-client/store/applicationsApi";

const APP = { id: "a1", company_id: "c1", role_title: "Staff Engineer", remote_type: "unknown", archived: false, events: [], contacts: [] };

function mockQuery(value: object) {
  vi.mocked(useGetApplicationQuery).mockReturnValue(value as unknown as ReturnType<typeof useGetApplicationQuery>);
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

describe("ApplicationDetail when a refetch fails", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the application on screen", () => {
    mockQuery({ data: APP, isLoading: false, isError: true, error: { status: 500 } });
    renderPage();
    expect(screen.getByRole("heading", { name: "Staff Engineer" })).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load that application.")).not.toBeInTheDocument();
  });

  it("still says it couldn't load when there is nothing to show", () => {
    mockQuery({ data: undefined, isLoading: false, isError: true, error: { status: 500 } });
    renderPage();
    expect(screen.getByText("Couldn't load that application.")).toBeInTheDocument();
  });
});
