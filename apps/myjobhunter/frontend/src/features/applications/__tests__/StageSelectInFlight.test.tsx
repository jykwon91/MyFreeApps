import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
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

function arrangeQuery(isFetching: boolean) {
  vi.mocked(useGetApplicationQuery).mockReturnValue({
    data: APP,
    isLoading: false,
    isError: false,
    isFetching,
  } as unknown as ReturnType<typeof useGetApplicationQuery>);
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
  arrangeQuery(false);
  return { transition, deferred };
}

const SURFACES: Array<[string, () => ReactElement, () => HTMLElement]> = [
  [
    "full page",
    () => (
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:id" element={<ApplicationDetail />} />
        </Routes>
      </MemoryRouter>
    ),
    () => screen.getByLabelText("Change stage"),
  ],
  [
    "drawer",
    () => (
      <MemoryRouter>
        <ApplicationDrawer applicationId="a1" onClose={vi.fn()} />
      </MemoryRouter>
    ),
    () => screen.getByLabelText("Stage:"),
  ],
];

describe.each(SURFACES)("stage select on the %s", (_name, surface, getSelect) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the picked stage, disables itself and sends once while the move is in flight", async () => {
    const { transition, deferred } = arrangeTransition();
    render(surface());

    await userEvent.selectOptions(getSelect(), "interviewing");

    await waitFor(() => expect(getSelect()).toBeDisabled());
    expect(getSelect()).toHaveValue("interviewing");

    await userEvent.selectOptions(getSelect(), "offer").catch(() => undefined);
    expect(transition).toHaveBeenCalledTimes(1);

    await act(async () => deferred[0].resolve());
    await waitFor(() => expect(getSelect()).not.toBeDisabled());
  });

  it("stays disabled and keeps the picked stage after the move is saved until the refetch lands", async () => {
    const { deferred } = arrangeTransition();
    const view = render(surface());

    await userEvent.selectOptions(getSelect(), "interviewing");
    arrangeQuery(true);
    await act(async () => deferred[0].resolve());

    expect(getSelect()).toBeDisabled();
    expect(getSelect()).toHaveValue("interviewing");

    arrangeQuery(false);
    view.rerender(surface());
    await waitFor(() => expect(getSelect()).not.toBeDisabled());
  });

  it("stays usable on a later background refetch once the move has finished", async () => {
    const { deferred } = arrangeTransition();
    const view = render(surface());

    await userEvent.selectOptions(getSelect(), "interviewing");
    await act(async () => deferred[0].resolve());
    await waitFor(() => expect(getSelect()).not.toBeDisabled());

    arrangeQuery(true);
    view.rerender(surface());

    expect(getSelect()).not.toBeDisabled();
    expect(getSelect()).toHaveValue("applied");
  });

  it("goes back to the current stage and shows the error when the move fails", async () => {
    const { deferred } = arrangeTransition();
    render(surface());

    await userEvent.selectOptions(getSelect(), "interviewing");
    await act(async () => deferred[0].reject({ status: 500, data: { detail: "boom" } }));

    await waitFor(() => expect(getSelect()).not.toBeDisabled());
    expect(getSelect()).toHaveValue("applied");
    expect(showError).toHaveBeenCalledWith(expect.stringContaining("Couldn't move"));
  });
});
