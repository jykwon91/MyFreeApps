/** A failed refetch (the drawer refetches on focus) keeps an already-loaded application open. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ApplicationDrawer from "@/features/applications/ApplicationDrawer";

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useGetApplicationQuery: vi.fn(),
  useDeleteApplicationMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateApplicationMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useGetCompanyQuery: () => ({ data: { name: "Acme Corp" } }),
}));
vi.mock("@/features/applications/useStageMove", () => ({
  useStageMove: () => ({ selectedColumn: "applied", isMoving: false, moveTo: vi.fn() }),
}));
vi.mock("@/features/applications/sections/OverviewSection", () => ({ default: () => null }));
vi.mock("@/features/applications/sections/EventsSection", () => ({ default: () => null }));
vi.mock("@/features/applications/sections/DocumentsSection", () => ({ default: () => null }));
vi.mock("@/features/applications/sections/NotesSection", () => ({ default: () => <div>notes editor</div> }));
vi.mock("@/features/applications/contacts/ContactsManager", () => ({ default: () => null }));

import { useGetApplicationQuery } from "@myjobhunter/api-client/store/applicationsApi";

const APP = { id: "a1", company_id: "c1", role_title: "Staff Engineer", remote_type: "unknown", archived: false, events: [], contacts: [], notes: null };

function mockQuery(value: object) {
  vi.mocked(useGetApplicationQuery).mockReturnValue(value as unknown as ReturnType<typeof useGetApplicationQuery>);
}

function renderDrawer() {
  render(
    <MemoryRouter>
      <ApplicationDrawer applicationId="a1" onClose={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("ApplicationDrawer when a refetch fails", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the application open", () => {
    mockQuery({ data: APP, isLoading: false, isError: true, error: { status: 500 } });
    renderDrawer();
    expect(screen.getByText("notes editor")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load that application.")).not.toBeInTheDocument();
  });

  it("still says it couldn't load when there is nothing to show", () => {
    mockQuery({ data: undefined, isLoading: false, isError: true, error: { status: 500 } });
    renderDrawer();
    expect(screen.getByText("Couldn't load that application.")).toBeInTheDocument();
  });
});
