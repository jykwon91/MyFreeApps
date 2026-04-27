import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import InquiryReplyPanel from "@/app/features/inquiries/InquiryReplyPanel";
import type { Integration } from "@/shared/types/integration/integration";
import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";

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

const triggerRender = vi.fn();
const sendReply = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));

let templateState = { data: [mockTemplate] as ReplyTemplate[], isLoading: false };
let integrationsState: { data: Integration[]; isLoading: boolean } = {
  data: [integrationWithSendScope],
  isLoading: false,
};
let renderState: { data: { subject: string; body: string } | undefined; isFetching: boolean } = {
  data: { subject: "Re: Cozy Room", body: "Hi Alice,\n\nWelcome." },
  isFetching: false,
};
let sendState = { isLoading: false };

vi.mock("@/shared/store/inquiriesApi", () => ({
  useGetReplyTemplatesQuery: vi.fn(() => templateState),
  useLazyRenderReplyTemplateQuery: vi.fn(() => [triggerRender, renderState]),
  useSendInquiryReplyMutation: vi.fn(() => [sendReply, sendState]),
}));

vi.mock("@/shared/store/integrationsApi", () => ({
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
    templateState = { data: [mockTemplate], isLoading: false };
    integrationsState = { data: [integrationWithSendScope], isLoading: false };
    renderState = {
      data: { subject: "Re: Cozy Room", body: "Hi Alice,\n\nWelcome." },
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
    renderState = { data: undefined, isFetching: false };
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
    renderState = { data: undefined, isFetching: false };
    renderPanel();
    expect(screen.getByTestId("reply-send-button")).toBeDisabled();
  });

  it("error toast appears when sendReply throws", async () => {
    sendReply.mockReturnValueOnce({
      unwrap: () => Promise.reject(new Error("boom")),
    });
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId(`reply-template-card-${mockTemplate.id}`));
    await user.click(screen.getByTestId("reply-send-button"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalled();
    });
  });
});
