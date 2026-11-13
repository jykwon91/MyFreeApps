import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, useLocation } from "react-router-dom";
import { store } from "@/shared/store";
import ReplyTemplatesManager from "@/app/features/inquiries/ReplyTemplatesManager";
import { showError, showSuccess } from "@platform/ui";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { useGetArchivedReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { archiveDescription, REPLY_TEMPLATE_MESSAGES as MESSAGES, viewLabel } from "@/shared/lib/reply-template-messages";
import { useCanWrite } from "@/shared/hooks/useOrgRole";

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

const create = vi.fn(() => ({ unwrap: () => Promise.resolve(t1) }));
const update = vi.fn(() => ({ unwrap: () => Promise.resolve(t1) }));
const archive = vi.fn(() => ({ unwrap: () => Promise.resolve() }));

type Reloaded = { isSuccess: boolean; data?: ReplyTemplate[] };
const refetch = vi.fn<() => Promise<Reloaded>>();

type ListState = { currentData: ReplyTemplate[] | undefined; isError: boolean; isFetching: boolean };
const loaded = (templates: ReplyTemplate[]): ListState => ({ currentData: templates, isError: false, isFetching: false });
let listState = loaded([t1]);

vi.mock("@mybookkeeper/api-client/store/inquiriesApi", () => ({
  useGetReplyTemplatesQuery: vi.fn(() => ({ ...listState, refetch })),
  useCreateReplyTemplateMutation: vi.fn(() => [create, { isLoading: false }]),
  useUpdateReplyTemplateMutation: vi.fn(() => [update, { isLoading: false }]),
  useArchiveReplyTemplateMutation: vi.fn(() => [archive, { isLoading: false }]),
  useGetArchivedReplyTemplatesQuery: vi.fn(() => ({
    currentData: [{ ...t1, id: "tpl-2", name: "Old decline", is_archived: true }],
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}));

vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));

function SearchSpy() {
  return <output data-testid="search-spy">{useLocation().search}</output>;
}

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  subscribe: vi.fn(() => () => {}),
}));

function managerTree(path = "/reply-templates") {
  return (
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <ReplyTemplatesManager />
        <SearchSpy />
      </MemoryRouter>
    </Provider>
  );
}

function renderManager(path = "/reply-templates") {
  return render(managerTree(path));
}

describe("ReplyTemplatesManager", () => {
  beforeEach(() => {
    create.mockClear();
    vi.mocked(showError).mockClear();
    update.mockClear();
    archive.mockClear();
    vi.mocked(showSuccess).mockClear();
    refetch.mockReset();
    refetch.mockResolvedValue({ isSuccess: true, data: [t1] });
    listState = loaded([t1]);
    vi.mocked(useCanWrite).mockReturnValue(true);
  });

  it("gives a viewer no New template, a view-only note, and the template read-only", async () => {
    vi.mocked(useCanWrite).mockReturnValue(false);
    const user = userEvent.setup();
    renderManager();
    expect(screen.queryByTestId("reply-template-new-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("reply-templates-view-only")).toHaveTextContent(MESSAGES.viewOnlyNote);
    await user.click(screen.getByRole("button", { name: viewLabel(t1.name) }));
    const view = screen.getByTestId("reply-template-view");
    expect(view).toHaveTextContent(t1.subject_template);
    expect(view).toHaveTextContent(t1.body_template);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reply-template-form")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: MESSAGES.close }));
    expect(screen.queryByTestId("reply-template-view")).not.toBeInTheDocument();
  });

  it("gives a writer no view-only note", () => {
    renderManager();
    expect(screen.queryByTestId("reply-templates-view-only")).not.toBeInTheDocument();
    expect(screen.getByTestId("reply-template-new-button")).toBeInTheDocument();
  });

  it("renders existing templates as rows", () => {
    renderManager();
    expect(screen.getByTestId(`reply-template-row-${t1.id}`)).toBeInTheDocument();
    expect(screen.getByText("Initial inquiry reply")).toBeInTheDocument();
  });

  it("shows empty state when no templates", () => {
    listState = loaded([]);
    renderManager();
    expect(screen.getByText(/No templates yet/i)).toBeInTheDocument();
  });

  it("never says there are none when the list didn't load", () => {
    listState = { currentData: undefined, isError: true, isFetching: false };
    renderManager();
    expect(screen.getByRole("alert")).toHaveTextContent(MESSAGES.couldntLoadActive);
    expect(screen.queryByText(/No templates yet/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("reply-template-new-button")).toBeInTheDocument();
  });

  it("opens the form when New template is clicked", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByTestId("reply-template-new-button"));
    expect(screen.getByTestId("reply-template-form")).toBeInTheDocument();
  });

  it("opens the edit form pre-filled when Edit is clicked", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByTestId(`reply-template-edit-${t1.id}`));
    expect(screen.getByTestId("reply-template-form")).toBeInTheDocument();
    expect(screen.getByTestId("reply-template-form-name")).toHaveValue(
      "Initial inquiry reply",
    );
  });

  async function saveNewTemplate(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTestId("reply-template-new-button"));
    await user.type(screen.getByTestId("reply-template-form-name"), "Same");
    await user.type(screen.getByTestId("reply-template-form-subject"), "Hi");
    await user.type(screen.getByTestId("reply-template-form-body"), "Hello");
    await user.click(screen.getByTestId("reply-template-form-submit"));
  }

  it("says why when the name is taken, and keeps the form open to change it", async () => {
    const user = userEvent.setup();
    const detail = "You already have a template with that name. Archived ones count too, so try another.";
    create.mockReturnValueOnce({ unwrap: () => Promise.reject({ status: 409, data: { detail } }) });
    renderManager();
    await saveNewTemplate(user);
    expect(showError).toHaveBeenCalledWith(detail);
    expect(screen.getByTestId("reply-template-form-name")).toHaveValue("Same");
  });

  it("offers another try on any other failure", async () => {
    const user = userEvent.setup();
    create.mockReturnValueOnce({ unwrap: () => Promise.reject({ status: 500, data: {} }) });
    renderManager();
    await saveNewTemplate(user);
    expect(showError).toHaveBeenCalledWith("I couldn't save that template. Want to try again?");
    expect(screen.getByTestId("reply-template-form")).toBeInTheDocument();
  });

  it("opens archive confirm dialog", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByTestId(`reply-template-archive-${t1.id}`));
    // ConfirmDialog renders the title and an Archive button.
    expect(
      screen.getByRole("heading", { name: /Archive this template/i }),
    ).toBeInTheDocument();
  });

  it("after archiving, focus moves to the next template's Archive button once the list reloads", async () => {
    const t2: ReplyTemplate = { ...t1, id: "tpl-2", name: "Decline" };
    listState = loaded([t1, t2]);
    const user = userEvent.setup();
    const { rerender } = renderManager();
    await user.click(screen.getByTestId(`reply-template-archive-${t1.id}`));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    listState = loaded([t2]);
    rerender(managerTree());
    await waitFor(() => expect(screen.getByTestId(`reply-template-archive-${t2.id}`)).toHaveFocus());
  });

  it("after archiving the last template, focus moves to New template", async () => {
    const user = userEvent.setup();
    const { rerender } = renderManager();
    await user.click(screen.getByTestId(`reply-template-archive-${t1.id}`));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    listState = loaded([]);
    rerender(managerTree());
    await waitFor(() => expect(screen.getByTestId("reply-template-new-button")).toHaveFocus());
  });

  it("archive confirm calls the mutation", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByTestId(`reply-template-archive-${t1.id}`));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(archive).toHaveBeenCalledWith(t1.id);
    });
  });

  async function confirmArchive(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTestId(`reply-template-archive-${t1.id}`));
    await user.click(screen.getByRole("button", { name: "Archive" }));
  }

  const dialogTitle = () => screen.queryByRole("heading", { name: /Archive this template/i });

  it("says it's archived and closes the dialog", async () => {
    const user = userEvent.setup();
    renderManager();
    await confirmArchive(user);
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MESSAGES.archived));
    await waitFor(() => expect(dialogTitle()).not.toBeInTheDocument());
    expect(refetch).not.toHaveBeenCalled();
  });

  it("says it was already gone on a 404, closes, and reloads the list", async () => {
    const user = userEvent.setup();
    archive.mockReturnValueOnce({ unwrap: () => Promise.reject({ status: 404, data: {} }) });
    renderManager();
    await confirmArchive(user);
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MESSAGES.alreadyGone));
    await waitFor(() => expect(dialogTitle()).not.toBeInTheDocument());
    expect(refetch).toHaveBeenCalled();
  });

  it("counts a 502 as archived when the reloaded list no longer has it", async () => {
    const user = userEvent.setup();
    archive.mockReturnValueOnce({ unwrap: () => Promise.reject({ status: 502, data: "<html>Bad Gateway</html>" }) });
    refetch.mockResolvedValueOnce({ isSuccess: true, data: [] });
    renderManager();
    await confirmArchive(user);
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MESSAGES.archived));
    expect(showError).not.toHaveBeenCalled();
  });

  it.each<[string, unknown, Reloaded, string, boolean]>([
    ["a 502 that left it listed", { status: 502, data: {} }, { isSuccess: true, data: [t1] }, MESSAGES.archiveFailed, true],
    ["a lost answer that left it listed", { status: undefined, data: "Network Error" }, { isSuccess: true, data: [t1] }, MESSAGES.archiveUnreachable, true],
    ["a lost answer it can't check", { status: undefined, data: "Network Error" }, { isSuccess: false }, MESSAGES.writeUnsure, false],
    ["a 403", { status: 403, data: {} }, { isSuccess: true, data: [t1] }, MESSAGES.archiveViewOnly, false],
  ])("on %s it says so, and keeps the dialog open only to try again", async (_case, error, reloaded, words, staysOpen) => {
    const user = userEvent.setup();
    archive.mockReturnValueOnce({ unwrap: () => Promise.reject(error) });
    refetch.mockResolvedValue(reloaded);
    renderManager();
    await confirmArchive(user);
    await waitFor(() => expect(showError).toHaveBeenCalledWith(words));
    if (staysOpen) expect(dialogTitle()).toBeInTheDocument();
    else await waitFor(() => expect(dialogTitle()).not.toBeInTheDocument());
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it("shows it's archiving at once and sends once however often Archive is pressed", async () => {
    const user = userEvent.setup();
    let answer = () => {};
    archive.mockReturnValueOnce({ unwrap: () => new Promise<void>((resolve) => (answer = resolve)) });
    renderManager();
    await confirmArchive(user);
    const confirm = screen.getByRole("button", { name: /Processing/ });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    answer();
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MESSAGES.archived));
    expect(archive).toHaveBeenCalledTimes(1);
  });

  it("doesn't close another template's dialog when an earlier archive answers", async () => {
    const user = userEvent.setup();
    const t2: ReplyTemplate = { ...t1, id: "tpl-3", name: "Welcome" };
    listState = loaded([t1, t2]);
    let answer = () => {};
    archive.mockReturnValueOnce({ unwrap: () => new Promise<void>((resolve) => (answer = resolve)) });
    renderManager();
    await confirmArchive(user);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialogTitle()).not.toBeInTheDocument());
    await user.click(screen.getByTestId(`reply-template-archive-${t2.id}`));
    answer();
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MESSAGES.archived));
    expect(dialogTitle()).toBeInTheDocument();
    expect(screen.getByText(archiveDescription(t2.name))).toBeInTheDocument();
  });

  it("says in the archive dialog that it can be restored and its name stays taken", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByTestId(`reply-template-archive-${t1.id}`));
    expect(screen.getByText(archiveDescription(t1.name))).toBeInTheDocument();
  });
});

describe("the Active and Archived tabs", () => {
  beforeEach(() => {
    vi.mocked(useGetArchivedReplyTemplatesQuery).mockClear();
    listState = loaded([t1]);
  });

  it("opens on Active, without asking for the archived ones", () => {
    renderManager();
    expect(screen.getByRole("tab", { name: "Active" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId(`reply-template-row-${t1.id}`)).toBeInTheDocument();
    expect(useGetArchivedReplyTemplatesQuery).not.toHaveBeenCalled();
  });

  it("opens on Archived from the link, with no New template button", () => {
    renderManager("/reply-templates?view=archived");
    expect(screen.getByRole("tab", { name: "Archived" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Old decline")).toBeInTheDocument();
    expect(screen.queryByTestId(`reply-template-row-${t1.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId("reply-template-new-button")).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "reply-templates-tab-archived");
  });

  it("falls back to Active for a view it doesn't know", () => {
    renderManager("/reply-templates?view=nonsense");
    expect(screen.getByRole("tab", { name: "Active" })).toHaveAttribute("aria-selected", "true");
  });

  it("puts the tab in the link, and takes it out again", async () => {
    const user = userEvent.setup();
    renderManager("/reply-templates?other=1");
    await user.click(screen.getByRole("tab", { name: "Archived" }));
    expect(screen.getByTestId("search-spy")).toHaveTextContent(/^\?other=1&view=archived$/);
    await user.click(screen.getByRole("tab", { name: "Active" }));
    expect(screen.getByTestId("search-spy")).toHaveTextContent(/^\?other=1$/);
  });

  it("moves between tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    renderManager();
    screen.getByRole("tab", { name: "Active" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Archived" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Archived" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Active" })).toHaveFocus();
  });

  it("jumps to the last and first tab with End and Home", async () => {
    const user = userEvent.setup();
    renderManager();
    screen.getByRole("tab", { name: "Active" }).focus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Archived" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Archived" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Active" })).toHaveFocus();
  });
});
