import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import ReplyTemplatesManager from "@/app/features/inquiries/ReplyTemplatesManager";
import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";

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

vi.mock("@/shared/store/inquiriesApi", () => ({
  useGetReplyTemplatesQuery: vi.fn(() => listState),
  useCreateReplyTemplateMutation: vi.fn(() => [create, { isLoading: false }]),
  useUpdateReplyTemplateMutation: vi.fn(() => [update, { isLoading: false }]),
  useArchiveReplyTemplateMutation: vi.fn(() => [archive, { isLoading: false }]),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  subscribe: vi.fn(() => () => {}),
}));

function renderManager() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ReplyTemplatesManager />
      </MemoryRouter>
    </Provider>,
  );
}

describe("ReplyTemplatesManager", () => {
  beforeEach(() => {
    create.mockClear();
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
});
