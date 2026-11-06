import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import InquiryReplyPanel from "@/app/features/inquiries/InquiryReplyPanel";
import type { Integration } from "@mybookkeeper/api-client/types/integration/integration";
import { REPLY_SEND_FAILURE_WORDS } from "@/shared/lib/inquiry-messages";
import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";

// ----- Default mock state -----
const mockTemplate: ReplyTemplate = {
  id: "tpl-1",
  organization_id: "org-1",
  user_id: "user-1",
  name: "Initial inquiry reply",
  subject_template: "Re: $listing",
  body_template: "Hi $name,\n\nWelcome.",
  is_archived: false,
  display_order: 0,
  created_at: "2026-04-25T10:00:00Z",
  updated_at: "2026-04-25T10:00:00Z",
};

const integrationWithSendScope: Integration = {
  provider: "gmail",
  connected: true,
  last_synced_at: null,
  metadata: null,
  has_send_scope: true,
};

const integrationWithoutSendScope: Integration = {
  provider: "gmail",
  connected: true,
  last_synced_at: null,
  metadata: null,
  has_send_scope: false,
};

const triggerRender = vi.fn((_args: { inquiryId: string; templateId: string }) => Promise.resolve({ isError: false }));
const sendReply = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));

interface TemplateListState {
  currentData: ReplyTemplate[] | undefined;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}
const refetchTemplates = vi.fn(() => Promise.resolve({}));
const listLoaded = (): TemplateListState => ({ currentData: [mockTemplate], isError: false, isFetching: false, refetch: refetchTemplates });
let templateState: TemplateListState = listLoaded();
let integrationsState: { data: Integration[]; isLoading: boolean } = {
  data: [integrationWithSendScope],
  isLoading: false,
};
let renderState: { currentData: { subject: string; body: string } | undefined; isFetching: boolean } = {
  currentData: { subject: "Re: Cozy Room", body: "Hi Alice,\n\nWelcome." },
  isFetching: false,
};
let sendState = { isLoading: false };

vi.mock("@mybookkeeper/api-client/store/inquiriesApi", () => ({
  useGetReplyTemplatesQuery: vi.fn(() => templateState),
  useLazyRenderReplyTemplateQuery: vi.fn(() => [triggerRender, renderState]),
  useSendInquiryReplyMutation: vi.fn(() => [sendReply, sendState]),
}));

vi.mock("@mybookkeeper/api-client/store/integrationsApi", () => ({
  useGetIntegrationsQuery: vi.fn(() => integrationsState),
}));

const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock("@/shared/lib/toast-store", () => ({
  showError: (msg: string) => showError(msg),
  showSuccess: (msg: string) => showSuccess(msg),
  subscribe: vi.fn(() => () => {}),
}));

function renderPanel() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <InquiryReplyPanel inquiryId="inq-1" onClose={() => {}} />
      </MemoryRouter>
    </Provider>,
  );
}

describe("InquiryReplyPanel", () => {
  beforeEach(() => {
    triggerRender.mockClear();
    sendReply.mockClear();
    showError.mockClear();
    showSuccess.mockClear();
    triggerRender.mockImplementation(() => Promise.resolve({ isError: false }));
    refetchTemplates.mockClear();
    templateState = listLoaded();
    integrationsState = { data: [integrationWithSendScope], isLoading: false };
    renderState = {
      currentData: { subject: "Re: Cozy Room", body: "Hi Alice,\n\nWelcome." },
      isFetching: false,
    };
    sendState = { isLoading: false };
  });

  it("renders the panel with template tab selected and a template card", () => {
    renderPanel();
    expect(screen.getByTestId("inquiry-reply-panel")).toBeInTheDocument();
    expect(screen.getByTestId("reply-tab-template")).toHaveAttribute(
      "aria-selected", "true",
    );
    expect(
      screen.getByTestId(`reply-template-card-${mockTemplate.id}`),
    ).toBeInTheDocument();
  });

  it("selecting a template fires the render query and populates the editor", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByTestId(`reply-template-card-${mockTemplate.id}`));

    expect(triggerRender).toHaveBeenCalledWith({
      inquiryId: "inq-1",
      templateId: "tpl-1",
    });
    // Subject + body editor populated from renderState mock.
    expect(screen.getByTestId("reply-subject-input")).toHaveValue("Re: Cozy Room");
    expect(screen.getByTestId("reply-body-input")).toHaveValue(
      "Hi Alice,\n\nWelcome.",
    );
  });

  it("clicking Send fires sendReply mutation with edited subject and body", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId(`reply-template-card-${mockTemplate.id}`));

    const subjectInput = screen.getByTestId("reply-subject-input") as HTMLInputElement;
    await user.clear(subjectInput);
    await user.type(subjectInput, "Re: Edited Subject");

    await user.click(screen.getByTestId("reply-send-button"));

    await waitFor(() => {
      expect(sendReply).toHaveBeenCalledWith({
        inquiryId: "inq-1",
        data: expect.objectContaining({
          template_id: "tpl-1",
          subject: "Re: Edited Subject",
        }),
      });
    });
    expect(showSuccess).toHaveBeenCalledWith("Reply sent.");
  });

  it("Custom tab clears the selected template id when sending", async () => {
    // Don't pre-populate the editor — start fresh for the custom tab.
    renderState = { currentData: undefined, isFetching: false };
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId("reply-tab-custom"));

    const subjectInput = screen.getByTestId("reply-subject-input") as HTMLInputElement;
    await user.type(subjectInput, "Custom subject");
    const bodyInput = screen.getByTestId("reply-body-input") as HTMLTextAreaElement;
    await user.type(bodyInput, "Custom body");

    await user.click(screen.getByTestId("reply-send-button"));

    await waitFor(() => {
      expect(sendReply).toHaveBeenCalledWith({
        inquiryId: "inq-1",
        data: expect.objectContaining({
          template_id: null,
          subject: "Custom subject",
          body: "Custom body",
        }),
      });
    });
  });

  it("shows reconnect banner when send scope missing and disables send", async () => {
    integrationsState = { data: [integrationWithoutSendScope], isLoading: false };
    renderPanel();

    expect(screen.getByTestId("gmail-reconnect-banner")).toBeInTheDocument();
    expect(screen.getByTestId("reply-send-button")).toBeDisabled();
  });

  it("shows reconnect banner when no Gmail integration at all", () => {
    integrationsState = { data: [], isLoading: false };
    renderPanel();

    expect(screen.getByTestId("gmail-reconnect-banner")).toBeInTheDocument();
  });

  it("does not show reconnect banner when send scope is granted", () => {
    renderPanel();
    expect(screen.queryByTestId("gmail-reconnect-banner")).toBeNull();
  });

  it("Send button is disabled while subject or body is empty", async () => {
    renderState = { currentData: undefined, isFetching: false };
    renderPanel();
    expect(screen.getByTestId("reply-send-button")).toBeDisabled();
  });

  it("says in the panel when a send gets no answer, and keeps the panel open", async () => {
    sendReply.mockReturnValueOnce({
      unwrap: () => Promise.reject(new Error("boom")),
    });
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId(`reply-template-card-${mockTemplate.id}`));
    await user.click(screen.getByTestId("reply-send-button"));

    expect(await screen.findByText(REPLY_SEND_FAILURE_WORDS.unsure)).toBeInTheDocument();
    expect(screen.getByTestId("inquiry-reply-panel")).toBeInTheDocument();
    expect(showSuccess).not.toHaveBeenCalled();
  });

  describe("template list states", () => {
    it("shows a card-shaped skeleton while templates load", () => {
      templateState = { ...listLoaded(), currentData: undefined, isFetching: true };
      renderPanel();
      expect(screen.getByTestId("reply-template-picker-skeleton")).toHaveAttribute("role", "status");
      expect(screen.queryByText(/Loading templates/)).not.toBeInTheDocument();
    });

    it("never reads a failed load as no templates, and Try again reloads", async () => {
      templateState = { ...listLoaded(), currentData: undefined, isError: true };
      const user = userEvent.setup();
      renderPanel();
      expect(screen.getByRole("alert")).toHaveTextContent("I couldn't load your templates. Want me to try again?");
      expect(screen.queryByTestId("reply-template-picker-empty")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Try again" }));
      expect(refetchTemplates).toHaveBeenCalledTimes(1);
    });

    it("keeps the last loaded templates usable when a reload fails", () => {
      templateState = { ...listLoaded(), isError: true };
      renderPanel();
      expect(screen.getByRole("status")).toHaveTextContent("I couldn't reload your templates");
      expect(screen.getByTestId(`reply-template-card-${mockTemplate.id}`)).toBeInTheDocument();
    });

    it("an empty list links to the Reply Templates page and closes the panel", async () => {
      templateState = { ...listLoaded(), currentData: [] };
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Provider store={store}>
          <MemoryRouter>
            <InquiryReplyPanel inquiryId="inq-1" onClose={onClose} />
          </MemoryRouter>
        </Provider>,
      );
      expect(screen.getByText("You don't have any templates yet.")).toBeInTheDocument();
      const link = screen.getByRole("link", { name: "Create one on the Reply Templates page" });
      expect(link).toHaveAttribute("href", "/reply-templates");
      await user.click(link);
      expect(onClose).toHaveBeenCalled();
    });

    it("Write custom still works when templates failed to load", async () => {
      templateState = { ...listLoaded(), currentData: undefined, isError: true };
      renderState = { currentData: undefined, isFetching: false };
      const user = userEvent.setup();
      renderPanel();
      await user.click(screen.getByTestId("reply-tab-custom"));
      expect(screen.getByTestId("reply-subject-input")).toBeInTheDocument();
    });
  });

  describe("filling in a template", () => {
    it("shows an editor skeleton while the template fills in", async () => {
      renderState = { currentData: undefined, isFetching: true };
      const user = userEvent.setup();
      renderPanel();
      await user.click(screen.getByTestId(`reply-template-card-${mockTemplate.id}`));
      expect(screen.getByTestId("reply-render-loading")).toHaveAttribute("role", "status");
      expect(screen.queryByTestId("reply-subject-input")).not.toBeInTheDocument();
    });

    it("a failed fill-in says so, keeps Send off, and Try again fills it in", async () => {
      triggerRender.mockImplementationOnce(() => Promise.resolve({ isError: true }));
      renderState = { currentData: undefined, isFetching: false };
      const user = userEvent.setup();
      const view = renderPanel();
      await user.click(screen.getByTestId(`reply-template-card-${mockTemplate.id}`));

      expect(await screen.findByRole("alert")).toHaveTextContent("I couldn't fill in that template. Want me to try again?");
      expect(screen.queryByTestId("reply-subject-input")).not.toBeInTheDocument();
      expect(screen.getByTestId("reply-send-button")).toBeDisabled();

      renderState = { currentData: { subject: "Re: Cozy Room", body: "Hi Alice" }, isFetching: false };
      await user.click(screen.getByRole("button", { name: "Try again" }));
      expect(triggerRender).toHaveBeenCalledTimes(2);
      view.rerender(
        <Provider store={store}>
          <MemoryRouter>
            <InquiryReplyPanel inquiryId="inq-1" onClose={() => {}} />
          </MemoryRouter>
        </Provider>,
      );
      expect(await screen.findByTestId("reply-subject-input")).toHaveValue("Re: Cozy Room");
      expect(screen.queryByTestId("reply-render-error")).not.toBeInTheDocument();
      expect(screen.getByTestId("reply-send-button")).toBeEnabled();
    });

    it("picking another template clears a failed fill-in", async () => {
      const other: ReplyTemplate = { ...mockTemplate, id: "tpl-2", name: "Polite decline" };
      templateState = { ...listLoaded(), currentData: [mockTemplate, other] };
      triggerRender.mockImplementationOnce(() => Promise.resolve({ isError: true }));
      const user = userEvent.setup();
      renderPanel();
      await user.click(screen.getByTestId(`reply-template-card-${mockTemplate.id}`));
      expect(await screen.findByTestId("reply-render-error")).toBeInTheDocument();

      await user.click(screen.getByTestId("reply-template-card-tpl-2"));
      await waitFor(() => expect(screen.queryByTestId("reply-render-error")).not.toBeInTheDocument());
      expect(screen.getByTestId("reply-subject-input")).toBeInTheDocument();
    });

    it("a late result from an earlier pick doesn't clear the current pick's failure", async () => {
      const other: ReplyTemplate = { ...mockTemplate, id: "tpl-2", name: "Polite decline" };
      templateState = { ...listLoaded(), currentData: [mockTemplate, other] };
      let finishFirst: (value: { isError: boolean }) => void = () => {};
      triggerRender
        .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
        .mockImplementationOnce(() => Promise.resolve({ isError: true }));
      const user = userEvent.setup();
      renderPanel();
      await user.click(screen.getByTestId(`reply-template-card-${mockTemplate.id}`));
      await user.click(screen.getByTestId("reply-template-card-tpl-2"));
      expect(await screen.findByTestId("reply-render-error")).toBeInTheDocument();

      await act(async () => finishFirst({ isError: false }));
      expect(screen.getByTestId("reply-render-error")).toBeInTheDocument();
      expect(screen.getByTestId("reply-send-button")).toBeDisabled();
    });
  });

  it("Write custom starts empty after a template was filled in, and can send", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId(`reply-template-card-${mockTemplate.id}`));
    expect(screen.getByTestId("reply-subject-input")).toHaveValue("Re: Cozy Room");

    await user.click(screen.getByTestId("reply-tab-custom"));
    expect(screen.getByTestId("reply-subject-input")).toHaveValue("");
    expect(screen.getByTestId("reply-body-input")).toHaveValue("");
    await user.type(screen.getByTestId("reply-subject-input"), "Hello");
    await user.type(screen.getByTestId("reply-body-input"), "Hi there");
    expect(screen.getByTestId("reply-send-button")).toBeEnabled();
  });

  it("a fill-in still on its way doesn't block or fill Write custom", async () => {
    renderState = { currentData: { subject: "Re: Cozy Room", body: "Hi Alice" }, isFetching: true };
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId(`reply-template-card-${mockTemplate.id}`));
    await user.click(screen.getByTestId("reply-tab-custom"));
    expect(screen.getByTestId("reply-subject-input")).toHaveValue("");
    await user.type(screen.getByTestId("reply-subject-input"), "Hello");
    await user.type(screen.getByTestId("reply-body-input"), "Hi there");
    expect(screen.getByTestId("reply-send-button")).toBeEnabled();
  });
});
