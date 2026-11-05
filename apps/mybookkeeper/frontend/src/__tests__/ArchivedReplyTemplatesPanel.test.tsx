import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import ArchivedReplyTemplatesPanel from "@/app/features/inquiries/ArchivedReplyTemplatesPanel";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { REPLY_TEMPLATE_MESSAGES as MESSAGES, restoreLabel } from "@/shared/lib/reply-template-messages";

const old: ReplyTemplate = {
  id: "tpl-2",
  organization_id: "org-1",
  user_id: "user-1",
  name: "Old decline",
  subject_template: "Re: $listing",
  body_template: "Hi $name",
  is_archived: true,
  display_order: 0,
  created_at: "2026-04-25T10:00:00Z",
  updated_at: "2026-04-25T10:00:00Z",
};

type Reloaded = { isSuccess: boolean; data?: ReplyTemplate[] };
const refetch = vi.fn<() => Promise<Reloaded>>();
const update = vi.fn();
let archivedState: { currentData: ReplyTemplate[] | undefined; isError: boolean; isFetching: boolean };

vi.mock("@mybookkeeper/api-client/store/inquiriesApi", () => ({
  useGetArchivedReplyTemplatesQuery: vi.fn(() => ({ ...archivedState, refetch })),
  useUpdateReplyTemplateMutation: vi.fn(() => [update, { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  subscribe: vi.fn(() => () => {}),
}));

const onShowActive = vi.fn();
const restoreButton = () => screen.getByRole("button", { name: restoreLabel(old.name) });

function failWith(error: unknown) {
  update.mockReturnValueOnce({ unwrap: () => Promise.reject(error) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCanWrite).mockReturnValue(true);
  archivedState = { currentData: [old], isError: false, isFetching: false };
  update.mockReturnValue({ unwrap: () => Promise.resolve({ ...old, is_archived: false }) });
  refetch.mockResolvedValue({ isSuccess: true, data: [old] });
});

describe("the archived templates panel", () => {
  it("shows a skeleton with a row shape while the first answer is on its way", () => {
    archivedState = { currentData: undefined, isError: false, isFetching: true };
    render(<ArchivedReplyTemplatesPanel onShowActive={onShowActive} />);
    expect(screen.getByTestId("archived-reply-templates-skeleton")).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.loadingArchived)).toBeInTheDocument();
  });

  it("lists archived templates with the intro and a Restore for each", () => {
    render(<ArchivedReplyTemplatesPanel onShowActive={onShowActive} />);
    expect(screen.getByText(old.name)).toBeInTheDocument();
    expect(screen.getByText(old.subject_template)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.archivedIntro)).toBeInTheDocument();
    expect(restoreButton()).toBeInTheDocument();
  });

  it("gives a viewer the list without Restore and without saying they can restore", () => {
    vi.mocked(useCanWrite).mockReturnValue(false);
    render(<ArchivedReplyTemplatesPanel onShowActive={onShowActive} />);
    expect(screen.getByText(MESSAGES.archivedIntroViewer)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: restoreLabel(old.name) })).not.toBeInTheDocument();
  });

  it.each([
    [true, MESSAGES.noArchived],
    [false, MESSAGES.noArchivedViewer],
  ])("says there are none (can write: %s) and offers the way back", async (canWrite, message) => {
    vi.mocked(useCanWrite).mockReturnValue(canWrite);
    archivedState = { currentData: [], isError: false, isFetching: false };
    render(<ArchivedReplyTemplatesPanel onShowActive={onShowActive} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: MESSAGES.backToActive }));
    expect(onShowActive).toHaveBeenCalled();
  });

  it("doesn't read a failed load as 'none', and tries again", async () => {
    archivedState = { currentData: undefined, isError: true, isFetching: false };
    render(<ArchivedReplyTemplatesPanel onShowActive={onShowActive} />);
    expect(screen.getByRole("alert")).toHaveTextContent(MESSAGES.couldntLoadArchived);
    expect(screen.queryByText(MESSAGES.noArchived)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(refetch).toHaveBeenCalled();
  });

  it("keeps the rows, with a banner, when a reload fails", () => {
    archivedState = { currentData: [old], isError: true, isFetching: false };
    render(<ArchivedReplyTemplatesPanel onShowActive={onShowActive} />);
    expect(screen.getByRole("alert")).toHaveTextContent(MESSAGES.showingLastLoaded);
    expect(restoreButton()).toBeEnabled();
  });
});

describe("restoring from the website", () => {
  async function clickRestore() {
    render(<ArchivedReplyTemplatesPanel onShowActive={onShowActive} />);
    await userEvent.setup().click(restoreButton());
  }

  it("restores it, says so, and keeps focus on the list", async () => {
    await clickRestore();
    expect(update).toHaveBeenCalledWith({ id: old.id, data: { is_archived: false } });
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MESSAGES.restored));
    expect(document.activeElement).toBe(screen.getByTestId("archived-reply-templates-panel"));
  });

  it("keeps focus on the panel when the last one leaves and the list empties", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ArchivedReplyTemplatesPanel onShowActive={onShowActive} />);
    await user.click(restoreButton());
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MESSAGES.restored));
    archivedState = { currentData: [], isError: false, isFetching: false };
    rerender(<ArchivedReplyTemplatesPanel onShowActive={onShowActive} />);
    expect(screen.getByText(MESSAGES.noArchived)).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId("archived-reply-templates-panel"));
  });

  it("shows Restoring… at once and sends once however often it's clicked", async () => {
    let release = () => {};
    update.mockReturnValueOnce({ unwrap: () => new Promise<void>((resolve) => (release = resolve)) });
    const user = userEvent.setup();
    render(<ArchivedReplyTemplatesPanel onShowActive={onShowActive} />);
    await user.click(restoreButton());
    expect(restoreButton()).toBeDisabled();
    expect(restoreButton()).toHaveTextContent(MESSAGES.restoring);
    await user.click(restoreButton());
    release();
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("says it's gone and reloads the list when the server no longer has it archived", async () => {
    failWith({ status: 404, data: { detail: "Reply template not found" } });
    await clickRestore();
    await waitFor(() => expect(showError).toHaveBeenCalledWith(MESSAGES.restoreGone));
    expect(refetch).toHaveBeenCalled();
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it.each([
    [403, MESSAGES.restoreViewOnly],
    [409, MESSAGES.restoreFailed],
    [422, MESSAGES.restoreFailed],
  ])("says so on a %s, never in the server's words", async (status, message) => {
    failWith({ status, data: { detail: "server words" } });
    await clickRestore();
    await waitFor(() => expect(showError).toHaveBeenCalledWith(message));
    expect(refetch).not.toHaveBeenCalled();
    expect(restoreButton()).toBeEnabled();
  });

  // With no answer at all, the shared base query fails with no status.
  const lost = { status: undefined, data: "Network Error" };

  it.each([
    ["no answer came", lost],
    ["the server failed", { status: 502, data: "<html>Bad Gateway</html>" }],
  ])("counts it as done when %s but the reloaded list doesn't have it", async (_why, error) => {
    failWith(error);
    refetch.mockResolvedValueOnce({ isSuccess: true, data: [] });
    await clickRestore();
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MESSAGES.restored));
  });

  it("says it's still archived when the answer was lost and the reloaded list still has it", async () => {
    failWith(lost);
    await clickRestore();
    await waitFor(() => expect(showError).toHaveBeenCalledWith(MESSAGES.restoreStillArchived));
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it("says it isn't sure when the list can't reload either", async () => {
    failWith({ status: 500 });
    refetch.mockResolvedValueOnce({ isSuccess: false });
    await clickRestore();
    await waitFor(() => expect(showError).toHaveBeenCalledWith(MESSAGES.restoreUnsure));
  });
});
