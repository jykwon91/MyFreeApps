/** The remote type reads as a label ("Onsite"), not the raw API value. */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ApplicationDetail from "@/pages/ApplicationDetail";

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useGetApplicationQuery: () => ({
    data: { id: "a1", company_id: "c1", role_title: "Staff Engineer", remote_type: "onsite", archived: false, events: [], contacts: [] },
    isLoading: false,
    isError: false,
  }),
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
vi.mock("@/features/applications/sections/NotesSection", () => ({ default: () => null }));
vi.mock("@/features/applications/contacts/ContactsManager", () => ({ default: () => null }));

describe("remote type display", () => {
  it("shows the formatted label in the detail page header", () => {
    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:id" element={<ApplicationDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Onsite")).toBeInTheDocument();
    expect(screen.queryByText("onsite")).not.toBeInTheDocument();
  });
});
