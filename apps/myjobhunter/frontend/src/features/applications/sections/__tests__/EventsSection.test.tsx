/**
 * The activity timeline tells loading, a failed load and a real empty list apart:
 * no count and a skeleton while loading, a retry when nothing loaded, loaded events
 * kept when a refetch fails, and "No events yet." only for an empty list.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EventsSection from "../EventsSection";
import type { ApplicationEvent } from "@myjobhunter/api-client/types/application-event";

interface QueryState {
  currentData: { items: ApplicationEvent[]; total: number } | undefined;
  isFetching: boolean;
  isError: boolean;
}

const refetchMock = vi.fn();
let queryState: QueryState;

vi.mock("@myjobhunter/api-client/store/applicationsApi", () => ({
  useListApplicationEventsQuery: () => ({ ...queryState, refetch: refetchMock }),
  useUpdateApplicationEventMutation: () => [vi.fn(), { isLoading: false }],
}));

vi.mock("@/features/applications/LogEventDialog", () => ({ default: () => null }));

function makeEvent(overrides: Partial<ApplicationEvent> = {}): ApplicationEvent {
  return {
    id: "evt-1",
    user_id: "user-1",
    application_id: "app-1",
    event_type: "applied",
    occurred_at: "2026-05-01T12:00:00Z",
    source: "manual",
    email_message_id: null,
    raw_payload: null,
    interview_details: null,
    note: "Sent it in",
    created_at: "2026-05-01T12:00:00Z",
    updated_at: "2026-05-01T12:00:00Z",
    ...overrides,
  };
}

describe("EventsSection", () => {
  beforeEach(() => {
    refetchMock.mockReset();
    refetchMock.mockResolvedValue(undefined);
  });

  it("shows a skeleton and no count or empty message while loading", () => {
    queryState = { currentData: undefined, isFetching: true, isError: false };
    render(<EventsSection applicationId="app-1" />);

    expect(screen.getAllByTestId("event-row-skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("No events yet.")).toBeNull();
    expect(screen.queryByText("(0)")).toBeNull();
  });

  it("shows an error with a working retry when nothing loaded", async () => {
    queryState = { currentData: undefined, isFetching: false, isError: true };
    render(<EventsSection applicationId="app-1" />);

    expect(screen.getByRole("alert")).toHaveTextContent("I couldn't load the activity.");
    expect(screen.queryByText("No events yet.")).toBeNull();
    expect(screen.queryByText("(0)")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps loaded events on screen when a refetch fails", () => {
    queryState = { currentData: { items: [makeEvent()], total: 1 }, isFetching: false, isError: true };
    render(<EventsSection applicationId="app-1" />);

    expect(screen.getByText("Sent it in")).toBeInTheDocument();
    expect(screen.getByText("(1)")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the empty state only for a really empty list", () => {
    queryState = { currentData: { items: [], total: 0 }, isFetching: false, isError: false };
    render(<EventsSection applicationId="app-1" />);

    expect(screen.getByText("No events yet.")).toBeInTheDocument();
    expect(screen.getByText("(0)")).toBeInTheDocument();
  });
});
