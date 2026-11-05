import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, useLocation } from "react-router-dom";
import { store } from "@/shared/store";
import ReplyTemplatesManager from "@/app/features/inquiries/ReplyTemplatesManager";
import { showError } from "@/shared/lib/toast-store";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { useGetArchivedReplyTemplatesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { archiveDescription } from "@/shared/lib/reply-template-messages";

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

let listState: { data: ReplyTemplate[]; isLoading: boolean } = {
  data: [t1],
  isLoading: false,
};

vi.mock("@mybookkeeper/api-client/store/inquiriesApi", () => ({
  useGetReplyTemplatesQuery: vi.fn(() => listState),
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

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  subscribe: vi.fn(() => () => {}),
}));

function renderManager(path = "/reply-templates") {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <ReplyTemplatesManager />
        <SearchSpy />
      </MemoryRouter>
    </Provider>,
  );
}

describe("ReplyTemplatesManager", () => {
  beforeEach(() => {
    create.mockClear();
    vi.mocked(showError).mockClear();
    update.mockClear();
    archive.mockClear();
    listState = { data: [t1], isLoading: false };
  });

  it("renders existing templates as rows", () => {
    renderManager();
    expect(screen.getByTestId(`reply-template-row-${t1.id}`)).toBeInTheDocument();
    expect(screen.getByText("Initial inquiry reply")).toBeInTheDocument();
  });

  it("shows empty state when no templates", () => {
    listState = { data: [], isLoading: false };
    renderManager();
    expect(screen.getByText(/No templates yet/i)).toBeInTheDocument();
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

  it("archive confirm calls the mutation", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByTestId(`reply-template-archive-${t1.id}`));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => {
      expect(archive).toHaveBeenCalledWith(t1.id);
    });
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
    listState = { data: [t1], isLoading: false };
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
});
