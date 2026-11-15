import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ApplicationDetail from "@/pages/ApplicationDetail";
import ApplicationDrawer from "@/features/applications/ApplicationDrawer";

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useGetApplicationQuery: vi.fn(),
  useDeleteApplicationMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUpdateApplicationMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useTransitionApplicationMutation: vi.fn(),
}));
vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useGetCompanyQuery: vi.fn(() => ({ data: undefined })),
}));
vi.mock("@/features/applications/sections/OverviewSection", () => ({ default: () => null }));
vi.mock("@/features/applications/sections/EventsSection", () => ({ default: () => null }));
vi.mock("@/features/applications/sections/DocumentsSection", () => ({ default: () => null }));
vi.mock("@/features/applications/sections/NotesSection", () => ({ default: () => null }));
vi.mock("@/features/applications/contacts/ContactsManager", () => ({ default: () => null }));
vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, showSuccess: vi.fn(), showError: vi.fn() };
});

import { showError } from "@platform/ui";
import {
  useGetApplicationQuery,
  useTransitionApplicationMutation,
} from "@myjobhunter/api-client/store/applicationsApi";

const APP = {
  id: "a1",
  role_title: "Staff Engineer",
  company_id: "c1",
  archived: false,
  remote_type: "unknown",
  notes: null,
  contacts: [],
  events: [{ id: "e1", event_type: "applied", occurred_at: "2026-11-01T00:00:00Z" }],
};

interface Deferred {
  resolve: () => void;
  reject: (err: unknown) => void;
}

function arrangeTransition(): { transition: ReturnType<typeof vi.fn>; deferred: Deferred[] } {
  const deferred: Deferred[] = [];
  const transition = vi.fn(() => ({
    unwrap: () =>
      new Promise((resolve, reject) => {
        deferred.push({ resolve: () => resolve({}), reject });
      }),
  }));
  vi.mocked(useTransitionApplicationMutation).mockReturnValue([
    transition,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useTransitionApplicationMutation>);
  vi.mocked(useGetApplicationQuery).mockReturnValue({
    data: APP,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useGetApplicationQuery>);
  return { transition, deferred };
}

const SURFACES: Array<[string, () => void, () => HTMLElement]> = [
  [
    "full page",
    () =>
      render(
        <MemoryRouter initialEntries={["/applications/a1"]}>
          <Routes>
            <Route path="/applications/:id" element={<ApplicationDetail />} />
          </Routes>
        </MemoryRouter>,
      ),
    () => screen.getByLabelText("Change stage"),
  ],
  [
    "drawer",
    () =>
      render(
        <MemoryRouter>
          <ApplicationDrawer applicationId="a1" onClose={vi.fn()} />
        </MemoryRouter>,
      ),
    () => screen.getByLabelText("Stage:"),
  ],
];

describe.each(SURFACES)("stage select on the %s", (_name, renderSurface, getSelect) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the picked stage, disables itself and sends once while the move is in flight", async () => {
    const { transition, deferred } = arrangeTransition();
    renderSurface();

    await userEvent.selectOptions(getSelect(), "interviewing");

    await waitFor(() => expect(getSelect()).toBeDisabled());
    expect(getSelect()).toHaveValue("interviewing");

    await userEvent.selectOptions(getSelect(), "offer").catch(() => undefined);
    expect(transition).toHaveBeenCalledTimes(1);

    await act(async () => deferred[0].resolve());
    await waitFor(() => expect(getSelect()).not.toBeDisabled());
  });

  it("goes back to the current stage and shows the error when the move fails", async () => {
    const { deferred } = arrangeTransition();
    renderSurface();

    await userEvent.selectOptions(getSelect(), "interviewing");
    await act(async () => deferred[0].reject({ status: 500, data: { detail: "boom" } }));

    await waitFor(() => expect(getSelect()).not.toBeDisabled());
    expect(getSelect()).toHaveValue("applied");
    expect(showError).toHaveBeenCalledWith(expect.stringContaining("Couldn't move"));
  });
});
