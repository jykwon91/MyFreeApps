import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Alert, Linking } from "react-native";
import { Provider } from "react-redux";
import { REPLY_TEMPLATE_MESSAGES } from "../src/constants/replyTemplates";
import InquiryReplyScreen from "../src/features/inquiries/InquiryReplyScreen";
import { REPLY_FAILURE_WORDS, REPLY_SEND_WORDS, replySentFromOtherGmailWords } from "../src/features/inquiries/replyStatus";
import { clearReplyRequestIds } from "../src/features/inquiries/replyRequestIds";
import { clearReplyDrafts, deleteReplyDraft, hasReplyDraft, loadReplyDraft, saveReplyDraft } from "../src/features/inquiries/replyDrafts";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { fakeFiles, File, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { aMessage, anInquiry, lastInquiryWrite, startInquiryServer } from "../test-support/inquiriesServer";

// The waits while an earlier copy is still sending.
const mockSleep = jest.fn(() => Promise.resolve());
jest.mock("@mybookkeeper/api-client/utils/sleep", () => ({ sleep: () => mockSleep() }));
let mockIdCount = 0;
const mockNewId = jest.fn(() => `request-${(mockIdCount += 1)}`);
jest.mock("expo-crypto", () => ({ randomUUID: () => mockNewId() }));

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockPreventRemove = { active: false };
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), push: (path: string) => mockPush(path) },
  usePreventRemove: (active: boolean) => {
    mockPreventRemove.active = active;
  },
}));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockModal: { onDismiss?: () => void } = {};
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, onDismiss, children }: { visible: boolean; onDismiss?: () => void; children: unknown }) => {
    if (onDismiss) mockModal.onDismiss = onDismiss;
    return visible ? children : null;
  },
}));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  resetFakeFiles();
  clearReplyRequestIds();
  jest.spyOn(session, "getState").mockReturnValue({ status: "signedIn", email: "me@example.com" } as never);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function renderScreen() {
  return render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <InquiryReplyScreen id="i1" />
      </ToastProvider>
    </Provider>,
  );
}

async function write(subject = "About the room", body = "Yes, it's open.") {
  await fireEvent.changeText(await screen.findByLabelText("Subject"), subject);
  await fireEvent.changeText(screen.getByLabelText("Message"), body);
}

async function chooseTemplate(label: string) {
  await fireEvent.press(await screen.findByRole("button", { name: /Choose a template|^Template:/ }));
  await fireEvent.press(await screen.findByRole("radio", { name: label }));
  await act(async () => {
    mockModal.onDismiss?.();
  });
}

const sendButton = () => screen.getByRole("button", { name: /^(Send|Try again|Check again|Send as a new reply|Send anyway as a new reply)$/ });

const replyIds = (server: { requests: { url?: string; data?: unknown }[] }) =>
  server.requests
    .filter((request) => request.url?.endsWith("/reply"))
    .map((request) => (JSON.parse(String(request.data)) as { client_request_id: string }).client_request_id);

describe("InquiryReplyScreen", () => {
  it("sends what was written, clears the draft and goes back", async () => {
    const server = startInquiryServer([anInquiry()]);
    await renderScreen();
    expect(await screen.findByText("To: dana@example.com")).toBeTruthy();
    await write();
    expect(hasReplyDraft("i1")).toBe(true);
    await fireEvent.press(sendButton());
    expect(await screen.findByText("Reply sent.")).toBeTruthy();
    expect(lastInquiryWrite(server)).toEqual({
      method: "post",
      url: "/inquiries/i1/reply",
      body: { template_id: null, subject: "About the room", body: "Yes, it's open.", client_request_id: expect.any(String) },
    });
    expect(hasReplyDraft("i1")).toBe(false);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("won't send without both a subject and a message", async () => {
    startInquiryServer([anInquiry()]);
    await renderScreen();
    await fireEvent.changeText(await screen.findByLabelText("Subject"), "About the room");
    expect(sendButton().props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText("Message"), "   ");
    expect(sendButton().props.accessibilityState.disabled).toBe(true);
  });

  describe("drafts", () => {
    it("restores one, and can start over", async () => {
      startInquiryServer([anInquiry()]);
      saveReplyDraft("i1", { subject: "Half", body: "Done", templateId: null });
      await renderScreen();
      expect(await screen.findByText("Restored your draft")).toBeTruthy();
      expect(screen.getByLabelText("Message").props.value).toBe("Done");
      await fireEvent.press(screen.getByRole("button", { name: "Start over" }));
      expect(screen.getByLabelText("Message").props.value).toBe("");
      expect(screen.queryByText("Restored your draft")).toBeNull();
      expect(hasReplyDraft("i1")).toBe(false);
    });

    it("keeps nothing when everything's been deleted", async () => {
      startInquiryServer([anInquiry()]);
      await renderScreen();
      await write();
      await write("", "");
      expect(hasReplyDraft("i1")).toBe(false);
    });

    it("hides one left by another account", () => {
      saveReplyDraft("i1", { subject: "Theirs", body: "", templateId: null });
      jest.mocked(session.getState).mockReturnValue({ status: "signedIn", email: "other@example.com" } as never);
      expect(hasReplyDraft("i1")).toBe(false);
      expect(loadReplyDraft("i1")).toBeNull();
    });

    it("says nothing when a draft can't be deleted", () => {
      saveReplyDraft("i1", { subject: "Half", body: "", templateId: null });
      jest.spyOn(File.prototype, "delete").mockImplementation(() => {
        throw new Error("disk");
      });
      expect(() => deleteReplyDraft("i1")).not.toThrow();
    });

    it("ignores one it can't read", () => {
      saveReplyDraft("i1", { subject: "Half", body: "", templateId: null });
      const file = new File(fakeFiles()[0]);
      file.write("{not json");
      expect(loadReplyDraft("i1")).toBeNull();
    });

    it("doesn't save after signing out, and sign-out clears them", () => {
      saveReplyDraft("i1", { subject: "Half", body: "", templateId: null });
      saveReplyDraft("i2", { subject: "Other", body: "", templateId: null });
      clearReplyDrafts();
      expect(fakeFiles()).toEqual([]);
      jest.mocked(session.getState).mockReturnValue({ status: "signedOut" } as never);
      saveReplyDraft("i1", { subject: "Half", body: "", templateId: null });
      expect(fakeFiles()).toEqual([]);
    });
  });

  describe("templates", () => {
    const TEMPLATES = [{ id: "t1", name: "Still open" }];

    it("fills in a chosen template and sends its id", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.templates = TEMPLATES;
      await renderScreen();
      await chooseTemplate("Still open");
      await waitFor(() => expect(screen.getByLabelText("Message").props.value).toBe("Hello from the template"));
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Template: Still open" })).toBeTruthy();
      await fireEvent.press(sendButton());
      await screen.findByText("Reply sent.");
      expect(lastInquiryWrite(server)?.body).toMatchObject({ template_id: "t1", subject: "Subject from t1" });
    });

    it("asks before replacing what's been written", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.templates = TEMPLATES;
      await renderScreen();
      await write();
      await chooseTemplate("Still open");
      expect(jest.mocked(Alert.alert).mock.calls[0][0]).toBe("Replace what you've written?");
      expect(screen.getByLabelText("Message").props.value).toBe("Yes, it's open.");
      await act(async () => {
        await jest.mocked(Alert.alert).mock.calls[0][2]?.find((button) => button.text === "Replace")?.onPress?.();
      });
      expect(screen.getByLabelText("Message").props.value).toBe("Hello from the template");
    });

    it("clears a template's words for writing your own, without asking when they're untouched", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.templates = TEMPLATES;
      await renderScreen();
      await chooseTemplate("Still open");
      await waitFor(() => expect(screen.getByLabelText("Message").props.value).toBe("Hello from the template"));
      await chooseTemplate("Write my own");
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Message").props.value).toBe("");
    });

    it("says when a template can't be built, and keeps what's there", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.templates = TEMPLATES;
      server.failTemplateRender = true;
      await renderScreen();
      await chooseTemplate("Still open");
      expect(await screen.findByText("I couldn't build that template. Want to try again?")).toBeTruthy();
    });

    it("hides the choice when there are no templates", async () => {
      startInquiryServer([anInquiry()]);
      await renderScreen();
      await screen.findByLabelText("Subject");
      expect(screen.queryByRole("button", { name: "Choose a template" })).toBeNull();
    });

    it("offers to make one when there are none", async () => {
      startInquiryServer([anInquiry()]);
      await renderScreen();
      await fireEvent.press(await screen.findByRole("button", { name: REPLY_TEMPLATE_MESSAGES.makeOne }));
      expect(mockPush).toHaveBeenCalledWith("/reply-templates/new");
    });

    it("says so, instead of hiding the choice, when the templates won't load, and recovers on a retry", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.templates = TEMPLATES;
      const answer = api.defaults.adapter as AxiosAdapter;
      let failing = true;
      api.defaults.adapter = (config) =>
        failing && config.url === "/reply-templates" ? Promise.reject({ response: { status: 500, data: {} }, config, isAxiosError: true }) : answer(config);
      await renderScreen();
      expect(await screen.findByText(REPLY_TEMPLATE_MESSAGES.templatesLoadFailed)).toBeTruthy();
      expect(screen.queryByRole("button", { name: REPLY_TEMPLATE_MESSAGES.makeOne })).toBeNull();
      failing = false;
      await fireEvent.press(screen.getByRole("button", { name: REPLY_TEMPLATE_MESSAGES.tryAgain }));
      expect(await screen.findByRole("button", { name: "Choose a template" })).toBeTruthy();
      expect(screen.queryByText(REPLY_TEMPLATE_MESSAGES.templatesLoadFailed)).toBeNull();
    });
  });

  describe("pet disclosure note", () => {
    const NOTE = "If this listing has a pet disclosure, I'll add it to the top of your first reply.";

    it("shows on a first reply about a listing", async () => {
      startInquiryServer([anInquiry({ listing_id: "l1" })]);
      await renderScreen();
      expect(await screen.findByText(NOTE)).toBeTruthy();
    });

    it("doesn't show once a reply has gone, or with no listing", async () => {
      startInquiryServer([anInquiry({ listing_id: "l1", messages: [aMessage({ direction: "outbound" })] })]);
      await renderScreen();
      await screen.findByLabelText("Subject");
      expect(screen.queryByText(NOTE)).toBeNull();
    });
  });

  describe("when Gmail can't send", () => {
    it.each([
      [[], "Connect Gmail to send replies. That part happens on the website."],
      [[{ provider: "gmail", has_send_scope: false, needs_reauth: false }], "Gmail needs permission to send as you. Reconnect it on the website. Your existing access stays."],
      [[{ provider: "gmail", has_send_scope: true, needs_reauth: true }], "Gmail disconnected. Reconnect on the website to send replies."],
    ])("lets you write, but not send, and points to the website", async (integrations, words) => {
      const server = startInquiryServer([anInquiry()]);
      server.integrations = integrations;
      const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
      await renderScreen();
      expect(await screen.findByText(words)).toBeTruthy();
      await write();
      expect(sendButton().props.accessibilityState.disabled).toBe(true);
      await fireEvent.press(screen.getByRole("button", { name: "Open on the website" }));
      expect(openURL.mock.calls[0][0]).toMatch(/\/integrations$/);
    });

    it("says there's no address to reply to", async () => {
      startInquiryServer([anInquiry({ inquirer_email: null })]);
      await renderScreen();
      expect(await screen.findByText("This inquiry has no email address, so I can't send a reply. You can call instead.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Open on the website" })).toBeNull();
    });
  });

  describe("when sending fails", () => {
    async function writeAndSend() {
      await renderScreen();
      await write();
      await fireEvent.press(sendButton());
    }

    it("keeps the words and allows another go when Gmail refuses", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = { status: 502 };
      await writeAndSend();
      expect(await screen.findByText("Gmail didn't accept that. Nothing was sent. Want me to try again?")).toBeTruthy();
      expect(screen.getByLabelText("Message").props.value).toBe("Yes, it's open.");
      expect(hasReplyDraft("i1")).toBe(true);
      server.sendOutcome = null;
      await fireEvent.press(sendButton());
      expect(await screen.findByText("Reply sent.")).toBeTruthy();
    });

    it("blocks until Gmail is reconnected when its access has gone", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = { status: 503, detail: "gmail_reauth_required" };
      const reconnected = server.integrations;
      await renderScreen();
      await write();
      server.integrations = [{ provider: "gmail", has_send_scope: true, needs_reauth: true }];
      await fireEvent.press(sendButton());
      expect(await screen.findByText("Gmail disconnected. Reconnect on the website to send replies.")).toBeTruthy();
      expect(sendButton().props.accessibilityState.disabled).toBe(true);

      server.integrations = reconnected;
      server.sendOutcome = null;
      await act(async () => {
        store.dispatch(baseApi.internalActions.onFocus());
      });
      await waitFor(() => expect(sendButton().props.accessibilityState.disabled).toBe(false));
      expect(screen.queryByText("Gmail disconnected. Reconnect on the website to send replies.")).toBeNull();
    });

    it("can still try again if the server says Gmail's gone but the list disagrees", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = { status: 503, detail: "gmail_reauth_required" };
      await writeAndSend();
      expect(await screen.findByText("Gmail disconnected. Reconnect on the website to send replies.")).toBeTruthy();
      expect(sendButton().props.accessibilityState.disabled).toBe(false);
    });

    it("says a reply that went out but wasn't recorded mustn't go again, and offers Check again", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = { status: 500, detail: "reply_sent_not_recorded" };
      await writeAndSend();
      expect(await screen.findByText(REPLY_FAILURE_WORDS.notRecorded)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
    });

    it("rechecks Gmail when the server says the connection is the problem", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = { status: 422 };
      await writeAndSend();
      expect(await screen.findByText("I couldn't send that. Check your Gmail connection on the website.")).toBeTruthy();
      expect(server.requests.filter((request) => request.url === "/integrations").length).toBeGreaterThan(1);
    });

    it("tries a lost answer again under the same id, so the reply goes once", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = "lostAfterSending";
      await writeAndSend();
      expect(await screen.findByText(REPLY_FAILURE_WORDS.unsure)).toBeTruthy();
      expect(hasReplyDraft("i1")).toBe(true);
      server.sendOutcome = null;
      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("Reply sent.")).toBeTruthy();
      const [first, second] = replyIds(server);
      expect(second).toBe(first);
      expect(server.inquiries[0].messages.filter((message) => message.direction === "outbound")).toHaveLength(1);
      expect(hasReplyDraft("i1")).toBe(false);
    });

    it.each([
      ["no answer", "lostBeforeSending" as const],
      ["a server fault", { status: 500 }],
      ["a gateway timeout", { status: 504 }],
    ])("says it couldn't confirm the reply after %s, and keeps the draft", async (_, outcome) => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = outcome;
      await writeAndSend();
      expect(await screen.findByText(REPLY_FAILURE_WORDS.unsure)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
      expect(hasReplyDraft("i1")).toBe(true);
    });

    it("warns that a changed reply would be a second email, until the change is undone", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = "lostBeforeSending";
      await writeAndSend();
      await screen.findByText(REPLY_FAILURE_WORDS.unsure);
      await fireEvent.changeText(screen.getByLabelText("Message"), "Yes, it's open. Rent is $900.");
      expect(screen.getByText(REPLY_SEND_WORDS.changedAfterMightHaveSent)).toBeTruthy();
      expect(screen.queryByText(REPLY_FAILURE_WORDS.unsure)).toBeNull();
      expect(screen.getByRole("button", { name: "Send as a new reply" })).toBeTruthy();
      await fireEvent.changeText(screen.getByLabelText("Message"), "Yes, it's open.");
      expect(screen.queryByText(REPLY_SEND_WORDS.changedAfterMightHaveSent)).toBeNull();
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    });

    it("sends a changed reply under a new id when asked to", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = "lostBeforeSending";
      await writeAndSend();
      await screen.findByText(REPLY_FAILURE_WORDS.unsure);
      server.sendOutcome = null;
      await fireEvent.changeText(screen.getByLabelText("Message"), "Different words.");
      await fireEvent.press(screen.getByRole("button", { name: "Send as a new reply" }));
      expect(await screen.findByText("Reply sent.")).toBeTruthy();
      const [first, second] = replyIds(server);
      expect(second).not.toBe(first);
    });

    it("doesn't warn about a second email after a definite refusal", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = { status: 502 };
      await writeAndSend();
      await screen.findByText(REPLY_FAILURE_WORDS.gmailRejected);
      await fireEvent.changeText(screen.getByLabelText("Message"), "Different words.");
      expect(screen.queryByText(REPLY_SEND_WORDS.changedAfterMightHaveSent)).toBeNull();
      expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    });

    it("remembers the reply may have gone after the screen is closed and opened again", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = "lostBeforeSending";
      const { unmount } = await renderScreen();
      await write();
      await fireEvent.press(sendButton());
      await screen.findByText(REPLY_FAILURE_WORDS.unsure);
      await act(async () => unmount());
      server.sendOutcome = null;
      await renderScreen();
      expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("Reply sent.")).toBeTruthy();
      const [first, second] = replyIds(server);
      expect(second).toBe(first);
    });

    describe("when an earlier attempt went through another Gmail account", () => {
      const otherAccount = { status: 409, detail: { code: "reply_sent_from_other_gmail", sender_gmail_address: "old@gmail.com" } };

      it("names the account, and sends anyway only as a new reply", async () => {
        const server = startInquiryServer([anInquiry()]);
        server.sendOutcome = otherAccount;
        await writeAndSend();
        expect(await screen.findByText(replySentFromOtherGmailWords("old@gmail.com"))).toBeTruthy();
        expect(hasReplyDraft("i1")).toBe(true);
        server.sendOutcome = null;
        await fireEvent.press(screen.getByRole("button", { name: "Send anyway as a new reply" }));
        expect(await screen.findByText("Reply sent.")).toBeTruthy();
        const [first, second] = replyIds(server);
        expect(second).not.toBe(first);
      });

      it("keeps naming it after the words change", async () => {
        const server = startInquiryServer([anInquiry()]);
        server.sendOutcome = otherAccount;
        await writeAndSend();
        await screen.findByText(replySentFromOtherGmailWords("old@gmail.com"));
        await fireEvent.changeText(screen.getByLabelText("Message"), "Yes, it's open. ");
        await fireEvent.changeText(screen.getByLabelText("Message"), "Yes, it's open.");
        expect(screen.getByText(replySentFromOtherGmailWords("old@gmail.com"))).toBeTruthy();
        expect(screen.getByRole("button", { name: "Send anyway as a new reply" })).toBeTruthy();
      });

      it("checks the earlier attempt again under its own id once the screen is reopened", async () => {
        const server = startInquiryServer([anInquiry()]);
        server.sendOutcome = otherAccount;
        const { unmount } = await renderScreen();
        await write();
        await fireEvent.press(sendButton());
        await screen.findByText(replySentFromOtherGmailWords("old@gmail.com"));
        await act(async () => unmount());
        server.sendOutcome = null;
        await renderScreen();
        await fireEvent.press(await screen.findByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Reply sent.")).toBeTruthy();
        const [first, second] = replyIds(server);
        expect(second).toBe(first);
      });
    });

    it("waits while an earlier copy is still sending, then offers Check again", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = { status: 409, detail: "reply_send_in_progress" };
      await writeAndSend();
      expect(await screen.findByText(REPLY_FAILURE_WORDS.inFlight)).toBeTruthy();
      const ids = replyIds(server);
      expect(ids.length).toBeGreaterThan(1);
      expect(new Set(ids).size).toBe(1);
      server.sendOutcome = null;
      await fireEvent.press(screen.getByRole("button", { name: "Check again" }));
      expect(await screen.findByText("Reply sent.")).toBeTruthy();
    });

    it("sends a later reply with the same words as an earlier unconfirmed one, once one has gone", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = "lostAfterSending";
      const { unmount } = await renderScreen();
      await write("Thanks", "Thanks!");
      await fireEvent.press(sendButton());
      await screen.findByText(REPLY_FAILURE_WORDS.unsure);
      server.sendOutcome = null;
      await fireEvent.changeText(screen.getByLabelText("Message"), "Thanks!!");
      await fireEvent.press(screen.getByRole("button", { name: "Send as a new reply" }));
      await screen.findByText("Reply sent.");
      await act(async () => unmount());

      await renderScreen();
      await write("Thanks", "Thanks!");
      expect(sendButton().props.accessibilityState.disabled).toBe(false);
      expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
      await fireEvent.press(sendButton());
      await screen.findByText("Reply sent.");
      const [first, , third] = replyIds(server);
      expect(third).not.toBe(first);
      expect(server.inquiries[0].messages.filter((message) => message.direction === "outbound")).toHaveLength(3);
    });

    it("says it's still sending while it waits", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = { status: 409, detail: "reply_send_in_progress" };
      let release: () => void = () => undefined;
      mockSleep.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
      await writeAndSend();
      expect(await screen.findByRole("button", { name: REPLY_SEND_WORDS.stillSending })).toBeTruthy();
      expect(mockPreventRemove.active).toBe(true);
      server.sendOutcome = null;
      await act(async () => release());
      expect(await screen.findByText("Reply sent.")).toBeTruthy();
    });

    it("says so when no request id can be made, and sends nothing", async () => {
      const server = startInquiryServer([anInquiry()]);
      const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
      mockNewId.mockImplementationOnce(() => {
        throw new Error("no native module");
      });
      await writeAndSend();
      expect(await screen.findByText(REPLY_FAILURE_WORDS.refused)).toBeTruthy();
      expect(replyIds(server)).toEqual([]);
      expect(logged).toHaveBeenCalled();
      expect(sendButton().props.accessibilityState.disabled).toBe(false);
    });

    it("explains a refusal for view-only access", async () => {
      const server = startInquiryServer([anInquiry()]);
      server.sendOutcome = { status: 403 };
      await writeAndSend();
      expect(await screen.findByText("You have view-only access.")).toBeTruthy();
    });
  });

  it("sends once when tapped twice", async () => {
    const server = startInquiryServer([anInquiry()]);
    await renderScreen();
    await write();
    const onPress = sendButton().props.onClick ?? sendButton().props.onPress;
    await act(async () => {
      onPress?.({});
      onPress?.({});
    });
    await screen.findByText("Reply sent.");
    expect(server.requests.filter((request) => request.url?.endsWith("/reply"))).toHaveLength(1);
  });

  it("holds the screen while sending", async () => {
    const server = startInquiryServer([anInquiry()]);
    const realAdapter = api.defaults.adapter as (config: never) => Promise<unknown>;
    let release: () => void = () => undefined;
    api.defaults.adapter = (config) => {
      if (config.url?.endsWith("/reply")) {
        return new Promise((resolve) => {
          release = () => resolve(realAdapter(config as never) as never);
        });
      }
      return realAdapter(config as never) as never;
    };
    await renderScreen();
    await write();
    await fireEvent.press(sendButton());
    expect(await screen.findByRole("button", { name: "Sending…" })).toBeTruthy();
    expect(mockPreventRemove.active).toBe(true);
    expect(screen.getByLabelText("Message").props.editable).toBe(false);
    await act(async () => release());
    expect(await screen.findByText("Reply sent.")).toBeTruthy();
    await waitFor(() => expect(mockPreventRemove.active).toBe(false));
    expect(server.inquiries[0].messages).toHaveLength(2);
  });

  it("won't start a restored draft over while it's sending", async () => {
    startInquiryServer([anInquiry()]);
    const realAdapter = api.defaults.adapter as (config: never) => Promise<unknown>;
    let release: () => void = () => undefined;
    api.defaults.adapter = (config) =>
      config.url?.endsWith("/reply")
        ? new Promise((resolve) => {
            release = () => resolve(realAdapter(config as never) as never);
          })
        : (realAdapter(config as never) as never);
    saveReplyDraft("i1", { subject: "Half", body: "Done", templateId: null });
    await renderScreen();
    await screen.findByText("Restored your draft");
    await fireEvent.press(sendButton());
    await screen.findByRole("button", { name: "Sending…" });
    expect(screen.getByRole("button", { name: "Start over" }).props.accessibilityState.disabled).toBe(true);
    await act(async () => release());
    expect(await screen.findByText("Reply sent.")).toBeTruthy();
  });

  it("is closed to a viewer", async () => {
    const server = startInquiryServer([anInquiry()]);
    server.role = "viewer";
    await renderScreen();
    expect(await screen.findByText("You have view-only access.")).toBeTruthy();
  });

  it("says when the inquiry is gone", async () => {
    startInquiryServer([]);
    await renderScreen();
    expect(await screen.findByText("I can't find that inquiry.")).toBeTruthy();
  });
});
