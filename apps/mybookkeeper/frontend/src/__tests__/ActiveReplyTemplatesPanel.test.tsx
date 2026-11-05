import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import ActiveReplyTemplatesPanel from "@/app/features/inquiries/ActiveReplyTemplatesPanel";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { REPLY_TEMPLATE_SKELETON_ROWS } from "@/shared/lib/reply-template-constants";
import { REPLY_TEMPLATE_MESSAGES as MESSAGES, viewLabel } from "@/shared/lib/reply-template-messages";

const t1: ReplyTemplate = {
  id: "tpl-1",
  organization_id: "org-1",
  user_id: "user-1",
  name: "Initial inquiry reply",
  subject_template: "Re: $listing",
  body_template: "Hi $name",
  is_archived: false,
  display_order: 0,
  created_at: "2026-04-25T10:00:00Z",
  updated_at: "2026-04-25T10:00:00Z",
};

const refetch = vi.fn();
let listState: { currentData: ReplyTemplate[] | undefined; isError: boolean; isFetching: boolean };

vi.mock("@mybookkeeper/api-client/store/inquiriesApi", () => ({
  useGetReplyTemplatesQuery: vi.fn(() => ({ ...listState, refetch })),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));

const onEdit = vi.fn();
const onArchive = vi.fn();
const onView = vi.fn();
const panel = () => <ActiveReplyTemplatesPanel onEdit={onEdit} onArchive={onArchive} onView={onView} />;
const renderPanel = () => render(panel());

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCanWrite).mockReturnValue(true);
  listState = { currentData: [t1], isError: false, isFetching: false };
});

describe("the active templates panel", () => {
  it("shows a skeleton shaped like the rows, not a line of text, while loading", () => {
    listState = { currentData: undefined, isError: false, isFetching: true };
    renderPanel();
    const skeleton = screen.getByTestId("active-reply-templates-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton.querySelectorAll("li")).toHaveLength(REPLY_TEMPLATE_SKELETON_ROWS.length);
    expect(screen.getByText(MESSAGES.loadingActive)).toBeInTheDocument();
    expect(screen.queryByText(/No templates yet/i)).not.toBeInTheDocument();
  });

  it("says it couldn't load, never 'none', and tries again", async () => {
    listState = { currentData: undefined, isError: true, isFetching: false };
    renderPanel();
    expect(screen.getByRole("alert")).toHaveTextContent(MESSAGES.couldntLoadActive);
    expect(screen.queryByText(/No templates yet/i)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the rows, with a quiet banner, when a reload fails", () => {
    listState = { currentData: [t1], isError: true, isFetching: false };
    renderPanel();
    expect(screen.getByRole("status")).toHaveTextContent(MESSAGES.showingLastLoadedActive);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(t1.name)).toBeInTheDocument();
  });

  it("gives a viewer View, never Edit or Archive, and a skeleton with one button a row", async () => {
    vi.mocked(useCanWrite).mockReturnValue(false);
    renderPanel();
    expect(screen.queryByRole("button", { name: `Edit ${t1.name}` })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Archive ${t1.name}` })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: viewLabel(t1.name) }));
    expect(onView).toHaveBeenCalledWith(t1);
  });

  it("draws one placeholder button a row for a viewer, two for a writer", () => {
    listState = { currentData: undefined, isError: false, isFetching: true };
    vi.mocked(useCanWrite).mockReturnValue(false);
    const { unmount } = renderPanel();
    const rows = REPLY_TEMPLATE_SKELETON_ROWS.length;
    expect(screen.getByTestId("active-reply-templates-skeleton").querySelectorAll("[data-testid=reply-templates-skeleton-action]")).toHaveLength(rows);
    unmount();
    vi.mocked(useCanWrite).mockReturnValue(true);
    renderPanel();
    expect(screen.getByTestId("active-reply-templates-skeleton").querySelectorAll("[data-testid=reply-templates-skeleton-action]")).toHaveLength(rows * 2);
  });

  it("tells a viewer there are none without asking them to create one", () => {
    vi.mocked(useCanWrite).mockReturnValue(false);
    listState = { currentData: [], isError: false, isFetching: false };
    renderPanel();
    expect(screen.getByText(MESSAGES.noActiveViewer)).toBeInTheDocument();
    expect(screen.queryByText(MESSAGES.noActive)).not.toBeInTheDocument();
  });

  it("says there are none only when an empty list loaded", () => {
    listState = { currentData: [], isError: false, isFetching: false };
    renderPanel();
    expect(screen.getByText(/No templates yet/i)).toBeInTheDocument();
  });

  it("shows it's trying, then brings focus to the panel when the retry takes its button away", async () => {
    let finish = () => {};
    refetch.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    listState = { currentData: undefined, isError: true, isFetching: false };
    const { rerender } = renderPanel();
    await userEvent.setup().click(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(screen.getByRole("button", { name: new RegExp(MESSAGES.tryingAgain) })).toBeDisabled();
    listState = { currentData: [t1], isError: false, isFetching: false };
    rerender(panel());
    await act(async () => finish());
    expect(document.activeElement).toBe(screen.getByTestId("active-reply-templates-panel"));
  });

  it("keeps the banner, trying, while a retry of stale rows is on its way", async () => {
    let finish = () => {};
    refetch.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    listState = { currentData: [t1], isError: true, isFetching: false };
    const { rerender } = renderPanel();
    await userEvent.setup().click(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    // Under way, the query is no longer in error.
    listState = { currentData: [t1], isError: false, isFetching: true };
    rerender(panel());
    expect(screen.getByRole("status")).toHaveTextContent(MESSAGES.showingLastLoadedActive);
    expect(screen.getByRole("button", { name: new RegExp(MESSAGES.tryingAgain) })).toBeDisabled();
    listState = { currentData: [t1], isError: false, isFetching: false };
    rerender(panel());
    await act(async () => finish());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText(t1.name)).toBeInTheDocument();
  });

  it("doesn't move focus when the list recovers on its own", () => {
    listState = { currentData: undefined, isError: true, isFetching: false };
    const { rerender } = renderPanel();
    listState = { currentData: [t1], isError: false, isFetching: false };
    rerender(panel());
    expect(document.activeElement).toBe(document.body);
  });
});
