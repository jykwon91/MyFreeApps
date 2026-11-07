import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import InquiryReplyPanel from "@/app/features/inquiries/InquiryReplyPanel";
import type { InquiryReplyRequest } from "@mybookkeeper/api-client/types/inquiry/inquiry-reply-request";
import type { Integration } from "@mybookkeeper/api-client/types/integration/integration";
import { INQUIRY_MESSAGES, REPLY_SEND_FAILURE_WORDS } from "@/shared/lib/inquiry-messages";

const gmail: Integration = {
  provider: "gmail",
  connected: true,
  last_synced_at: null,
  metadata: null,
  has_send_scope: true,
};

type SendArgs = { inquiryId: string; data: InquiryReplyRequest };
type Answer = { resolve: () => void; reject: (error: unknown) => void };
const answers: Answer[] = [];
const sendReply = vi.fn((_args: SendArgs) => ({
  unwrap: () =>
    new Promise<object>((resolve, reject) => {
      answers.push({ resolve: () => resolve({ id: "m1" }), reject });
    }),
}));

vi.mock("@mybookkeeper/api-client/store/inquiriesApi", () => ({
  useGetReplyTemplatesQuery: vi.fn(() => ({ currentData: [], isError: false, isFetching: false, refetch: vi.fn() })),
  useLazyRenderReplyTemplateQuery: vi.fn(() => [vi.fn(), { currentData: undefined, isFetching: false }]),
  useSendInquiryReplyMutation: vi.fn(() => [sendReply, { isLoading: false }]),
}));

vi.mock("@mybookkeeper/api-client/store/integrationsApi", () => ({
  useGetIntegrationsQuery: vi.fn(() => ({ data: [gmail], isLoading: false })),
}));

const showSuccess = vi.fn();
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: (msg: string) => showSuccess(msg),
  subscribe: vi.fn(() => () => {}),
}));

let ids = 0;
const newRequestId = vi.fn(() => `req-${++ids}`);
vi.mock("@/shared/lib/new-request-id", () => ({ newRequestId: () => newRequestId() }));

const onClose = vi.fn();
// Saved ids outlive a test, so each test replies to its own inquiry.
let inquiryCount = 0;
let inquiryId = "";

function renderPanel() {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <InquiryReplyPanel inquiryId={inquiryId} onClose={onClose} />
      </MemoryRouter>
    </Provider>,
  );
}

async function writeReply(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("reply-tab-custom"));
  await user.type(screen.getByTestId("reply-subject-input"), "Re: Room");
  await user.type(screen.getByTestId("reply-body-input"), "Yes, it's open.");
}

const sentIds = () => sendReply.mock.calls.map(([args]) => args.data.client_request_id);
const answer = async (index: number, outcome: "ok" | { status?: number; data?: { detail?: unknown } }) => {
  await waitFor(() => expect(answers.length).toBeGreaterThan(index));
  await act(async () => {
    if (outcome === "ok") answers[index].resolve();
    else answers[index].reject(outcome);
  });
};

describe("InquiryReplyPanel sending", () => {
  beforeEach(() => {
    answers.length = 0;
    ids = 0;
    inquiryId = `inq-${++inquiryCount}`;
    sessionStorage.clear();
    newRequestId.mockClear();
    sendReply.mockClear();
    showSuccess.mockClear();
    onClose.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the reply with a request id and closes on success", async () => {
    const user = userEvent.setup();
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, "ok");

    expect(sentIds()).toEqual(["req-1"]);
    expect(sendReply.mock.calls[0][0].data).toMatchObject({ subject: "Re: Room", body: "Yes, it's open.", template_id: null });
    expect(showSuccess).toHaveBeenCalledWith("Reply sent.");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a double click sends once", async () => {
    const user = userEvent.setup();
    renderPanel();
    await writeReply(user);
    const button = screen.getByTestId("reply-send-button");
    await user.dblClick(button);
    await answer(0, "ok");
    expect(sendReply).toHaveBeenCalledTimes(1);
  });

  it("tries again with the same id after a send it couldn't confirm", async () => {
    const user = userEvent.setup();
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, { status: 504, data: { detail: "reply_send_unconfirmed" } });

    expect(screen.getByTestId("reply-send-failure")).toHaveTextContent(REPLY_SEND_FAILURE_WORDS.unsure);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await answer(1, "ok");

    expect(sentIds()).toEqual(["req-1", "req-1"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("after a send that may have gone out, says an edited reply would be a second email", async () => {
    const user = userEvent.setup();
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, {});
    await user.type(screen.getByTestId("reply-body-input"), " Call me.");

    expect(screen.getByTestId("reply-send-failure")).toHaveTextContent(INQUIRY_MESSAGES.replyChangedAfterMightHaveSent);
    expect(screen.getByTestId("reply-send-button")).toHaveTextContent("Send as a new reply");
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(1, "ok");
    expect(sentIds()).toEqual(["req-1", "req-2"]);
  });

  it("an edit after a send that surely didn't go out is just a new reply", async () => {
    const user = userEvent.setup();
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, { status: 502, data: { detail: "Gmail rejected the message" } });
    await user.type(screen.getByTestId("reply-body-input"), " Call me.");

    expect(screen.getByTestId("reply-send-failure")).toBeEmptyDOMElement();
    expect(screen.getByTestId("reply-send-button")).toHaveTextContent("Send reply");
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(1, "ok");
    expect(sentIds()).toEqual(["req-1", "req-2"]);
  });

  it("waits while an earlier copy is still sending, then gets the reply", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, { status: 409, data: { detail: "reply_send_in_progress" } });

    expect(await screen.findByText(INQUIRY_MESSAGES.replyStillSending)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await answer(1, "ok");

    expect(sentIds()).toEqual(["req-1", "req-1"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("after about 30 seconds says it's taking a while and offers Check again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await answer(attempt, { status: 409, data: { detail: "reply_send_in_progress" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
    }

    expect(await screen.findByTestId("reply-send-failure")).toHaveTextContent(REPLY_SEND_FAILURE_WORDS.inFlight);
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
    expect(new Set(sentIds())).toEqual(new Set(["req-1"]));
  });

  it("can't be cancelled or closed mid-send", async () => {
    const user = userEvent.setup();
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Close panel" }));
    expect(onClose).not.toHaveBeenCalled();
    await answer(0, "ok");
  });

  it("gets a new id when the server holds a different reply under the old one", async () => {
    const user = userEvent.setup();
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, { status: 422, data: { detail: "reply_request_id_reused" } });
    expect(screen.getByTestId("reply-send-failure")).toHaveTextContent(REPLY_SEND_FAILURE_WORDS.refused);

    await user.click(screen.getByTestId("reply-send-button"));
    await answer(1, "ok");
    expect(sentIds()).toEqual(["req-1", "req-2"]);
  });

  it("names the other Gmail account an earlier attempt went through, and sends anyway only under a new id", async () => {
    const otherAccount = { status: 409, data: { detail: { code: "reply_sent_from_other_gmail", sender_gmail_address: "old@gmail.com" } } };
    const user = userEvent.setup();
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, otherAccount);

    expect(screen.getByTestId("reply-send-failure")).toHaveTextContent(/gone out from old@gmail\.com,/);
    expect(screen.getByTestId("reply-send-button")).toHaveTextContent(INQUIRY_MESSAGES.replySendAnywayButton);

    await user.click(screen.getByTestId("reply-send-button"));
    await answer(1, "ok");
    expect(sentIds()).toEqual(["req-1", "req-2"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("checks the earlier attempt again after reopening, for when that account is reconnected", async () => {
    const otherAccount = { status: 409, data: { detail: { code: "reply_sent_from_other_gmail", sender_gmail_address: "old@gmail.com" } } };
    const user = userEvent.setup();
    const first = renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, otherAccount);
    first.unmount();

    renderPanel();
    await writeReply(user);
    expect(screen.getByTestId("reply-send-button")).toHaveTextContent(INQUIRY_MESSAGES.replyTryAgainButton);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(1, "ok");
    expect(sentIds()).toEqual(["req-1", "req-1"]);
  });

  it("forgets an account it couldn't check once another reply has gone", async () => {
    const otherAccount = { status: 409, data: { detail: { code: "reply_sent_from_other_gmail", sender_gmail_address: "old@gmail.com" } } };
    const user = userEvent.setup();
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, otherAccount);
    await user.type(screen.getByTestId("reply-body-input"), " Different.");
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(1, "ok");

    await user.clear(screen.getByTestId("reply-subject-input"));
    await user.clear(screen.getByTestId("reply-body-input"));
    await user.type(screen.getByTestId("reply-subject-input"), "Re: Room");
    await user.type(screen.getByTestId("reply-body-input"), "Yes, it's open.");
    expect(screen.getByTestId("reply-send-button")).toHaveTextContent("Send reply");
    expect(screen.queryByText(/gone out from old@gmail\.com/)).toBeNull();
  });

  it("says Gmail refused it, so nothing was sent", async () => {
    const user = userEvent.setup();
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, { status: 502, data: { detail: "Gmail rejected the message" } });
    expect(screen.getByTestId("reply-send-failure")).toHaveTextContent(REPLY_SEND_FAILURE_WORDS.gmailRejected);
    expect(screen.getByRole("button", { name: "Send reply" })).toBeEnabled();
  });

  it("keeps the id when an edit is undone, since it's the same reply", async () => {
    const user = userEvent.setup();
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, { status: 504, data: { detail: "reply_send_unconfirmed" } });
    await user.type(screen.getByTestId("reply-body-input"), "x{Backspace}");
    expect(screen.getByTestId("reply-send-button")).toHaveTextContent("Try again");
    expect(screen.getByTestId("reply-send-failure")).toBeEmptyDOMElement();
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(1, "ok");
    expect(sentIds()).toEqual(["req-1", "req-1"]);
  });

  it("keeps the id, and the warning, after the panel is closed and opened again", async () => {
    const user = userEvent.setup();
    const first = renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, {});
    first.unmount();

    const second = renderPanel();
    await user.click(screen.getByTestId("reply-tab-custom"));
    await user.type(screen.getByTestId("reply-subject-input"), "Re: Room");
    await user.type(screen.getByTestId("reply-body-input"), "Something else.");
    expect(screen.getByTestId("reply-send-button")).toHaveTextContent("Send as a new reply");
    second.unmount();

    renderPanel();
    await writeReply(user);
    expect(screen.getByTestId("reply-send-button")).toHaveTextContent("Try again");
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(1, "ok");
    expect(sentIds()).toEqual(["req-1", "req-1"]);
  });

  it("forgets the warning once a reply is confirmed sent", async () => {
    const user = userEvent.setup();
    const first = renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, {});
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(1, "ok");
    first.unmount();

    renderPanel();
    await writeReply(user);
    expect(screen.getByTestId("reply-send-button")).toHaveTextContent("Send reply");
  });

  it("can't switch tab or template while sending", async () => {
    const user = userEvent.setup();
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    expect(screen.getByTestId("reply-tab-template")).toBeDisabled();
    expect(screen.getByTestId("reply-tab-custom")).toBeDisabled();
    await answer(0, "ok");
  });

  it("says so, and doesn't get stuck sending, when an id can't be made", async () => {
    const user = userEvent.setup();
    const failure = new Error("no randomUUID");
    newRequestId.mockImplementationOnce(() => {
      throw failure;
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));

    expect(await screen.findByText(REPLY_SEND_FAILURE_WORDS.refused)).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith(failure);
    expect(sendReply).not.toHaveBeenCalled();
    expect(screen.getByTestId("reply-send-button")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    logged.mockRestore();
  });

  it.each([
    [{ status: 500, data: { detail: "reply_sent_not_recorded" } }, "notRecorded", "Check again"],
    [{ status: 422, data: { detail: "reply_no_recipient" } }, "noRecipient", "Send reply"],
    [{ status: 503, data: { detail: "gmail_reauth_required" } }, "gmailDisconnected", "Send reply"],
  ] as const)("explains %j", async (error, failure, button) => {
    const user = userEvent.setup();
    renderPanel();
    await writeReply(user);
    await user.click(screen.getByTestId("reply-send-button"));
    await answer(0, error);
    expect(screen.getByTestId("reply-send-failure")).toHaveTextContent(REPLY_SEND_FAILURE_WORDS[failure]);
    expect(screen.getByTestId("reply-send-button")).toHaveTextContent(button);
  });
});
