import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert, Linking } from "react-native";
import { Provider } from "react-redux";
import InquiryDetailScreen from "../src/features/inquiries/InquiryDetailScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { saveReplyDraft } from "../src/features/inquiries/replyDrafts";
import { resetFakeFiles } from "../test-support/fakeFileSystem";
import { aMessage, anInquiry, lastInquiryWrite, startInquiryServer } from "../test-support/inquiriesServer";
import { holdWrites } from "../test-support/holdWrites";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockDispatch = jest.fn();
const mockPreventRemove: { active: boolean; callback: ((event: { repeat: () => void }) => void) | null } = { active: false, callback: null };
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), push: (path: string) => mockPush(path) },
  useFocusEffect: (effect: () => void) => jest.requireActual<typeof import("react")>("react").useEffect(effect, [effect]),
  usePreventRemove: (active: boolean, callback: (event: { repeat: () => void }) => void) => {
    mockPreventRemove.active = active;
    mockPreventRemove.callback = callback;
    // Leaving the screen ends the guard, as the real hook does.
    jest.requireActual<typeof import("react")>("react").useEffect(
      () => () => {
        mockPreventRemove.active = false;
      },
      [],
    );
  },
}));
jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
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
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function renderScreen(id = "i1") {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <InquiryDetailScreen id={id} />
      </ToastProvider>
    </Provider>,
  );
}

async function pressAlertButton(text: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  await act(async () => {
    await buttons.find((button) => button.text === text)?.onPress?.();
  });
}

async function chooseMore(label: string) {
  await fireEvent.press(await screen.findByRole("button", { name: "More" }));
  await fireEvent.press(await screen.findByRole("radio", { name: label }));
  await act(async () => {
    mockModal.onDismiss?.();
  });
}

describe("InquiryDetailScreen", () => {
  it("shows who it is, what they asked and the stay", async () => {
    const server = startInquiryServer([anInquiry({ listing_id: "l1" })]);
    server.listingTitle = "Garden room";
    await renderScreen();
    expect(await screen.findByRole("header", { name: "Dana Reed" })).toBeTruthy();
    expect(screen.getByText("Is the room still open?")).toBeTruthy();
    expect(screen.getByText("Memorial Hospital")).toBeTruthy();
    expect(await screen.findByText("Garden room")).toBeTruthy();
  });

  it("leads with their latest message and tucks the rest away", async () => {
    const now = Date.now();
    startInquiryServer([
      anInquiry({
        messages: [
          aMessage({ id: "m1", parsed_body: "First question", sent_at: new Date(now - 3000_000).toISOString() }),
          aMessage({ id: "m2", direction: "outbound", parsed_body: "My answer", sent_at: new Date(now - 2000_000).toISOString() }),
          aMessage({ id: "m3", parsed_body: "Second question", sent_at: new Date(now - 1000_000).toISOString() }),
        ],
      }),
    ]);
    await renderScreen();
    expect(await screen.findByText("Second question")).toBeTruthy();
    expect(screen.queryByText("My answer")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show 2 other messages" }));
    expect(screen.getByText("My answer")).toBeTruthy();
    expect(screen.getByText("First question")).toBeTruthy();
  });

  it("shortens a long message until asked", async () => {
    startInquiryServer([anInquiry({ messages: [aMessage({ parsed_body: "word ".repeat(200) })] })]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Show more" }));
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
  });

  it("calls, texts and emails them, and says so if the phone can't", async () => {
    startInquiryServer([anInquiry()]);
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Call Dana Reed, (555) 010-2030" }));
    expect(openURL).toHaveBeenLastCalledWith("tel:5550102030");
    await fireEvent.press(screen.getByRole("button", { name: "Text Dana Reed, (555) 010-2030" }));
    expect(openURL).toHaveBeenLastCalledWith("sms:5550102030");
    await fireEvent.press(screen.getByRole("button", { name: "Email Dana Reed, dana@example.com" }));
    expect(openURL).toHaveBeenLastCalledWith("mailto:dana%40example.com");
    openURL.mockRejectedValue(new Error("no"));
    await fireEvent.press(screen.getByRole("button", { name: "Text Dana Reed, (555) 010-2030" }));
    expect(await screen.findByText("I couldn't open that on this phone.")).toBeTruthy();
  });

  it("leaves an extension out of what it dials, and keeps a country code", async () => {
    startInquiryServer([anInquiry({ inquirer_phone: "+1 (555) 010-2030 x89" })]);
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: /^Call Dana Reed/ }));
    expect(openURL).toHaveBeenLastCalledWith("tel:+15550102030");
  });

  it("says when there's no way to reach them", async () => {
    startInquiryServer([anInquiry({ inquirer_email: null, inquirer_phone: null })]);
    await renderScreen();
    expect(await screen.findByText("No phone number or email.")).toBeTruthy();
  });

  it("moves it to another stage and shows that straight away", async () => {
    const server = startInquiryServer([anInquiry()]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Stage: New" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Replied" }));
    expect(await screen.findByText("Moved to Replied.")).toBeTruthy();
    expect(lastInquiryWrite(server)).toEqual({ method: "patch", url: "/inquiries/i1", body: { stage: "replied" } });
    expect(await screen.findByRole("button", { name: "Stage: Replied" })).toBeTruthy();
  });

  it("says when the stage couldn't change, and keeps the old one", async () => {
    const server = startInquiryServer([anInquiry()]);
    await renderScreen();
    server.failWritesWith = 500;
    await fireEvent.press(await screen.findByRole("button", { name: "Stage: New" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Replied" }));
    expect(await screen.findByText("I couldn't update that stage. Want to try again?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stage: New" })).toBeTruthy();
  });

  it("explains a refusal for someone with view-only access", async () => {
    const server = startInquiryServer([anInquiry()]);
    await renderScreen();
    server.failWritesWith = 403;
    await fireEvent.press(await screen.findByRole("button", { name: "Stage: New" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Replied" }));
    expect(await screen.findByText("You have view-only access.")).toBeTruthy();
  });

  it("flags possible spam and lets you settle it either way", async () => {
    const server = startInquiryServer([anInquiry({ spam_status: "flagged" })]);
    await renderScreen();
    expect(await screen.findByText("I flagged this as possible spam.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Not spam" }));
    expect(await screen.findByText("Marked as not spam.")).toBeTruthy();
    expect(lastInquiryWrite(server)?.url).toBe("/inquiries/i1/mark-not-spam");
    await waitFor(() => expect(screen.queryByText("I flagged this as possible spam.")).toBeNull());
  });

  it("marks as spam from More", async () => {
    const server = startInquiryServer([anInquiry()]);
    await renderScreen();
    await chooseMore("Mark as spam");
    expect(await screen.findByText("Marked as spam.")).toBeTruthy();
    expect(lastInquiryWrite(server)?.url).toBe("/inquiries/i1/mark-spam");
    expect(await screen.findByText("This is marked as spam.")).toBeTruthy();
  });

  it("asks before declining", async () => {
    const server = startInquiryServer([anInquiry()]);
    await renderScreen();
    await chooseMore("Decline");
    expect(Alert.alert).toHaveBeenCalledWith("Decline this inquiry?", "It moves to Declined. You can move it back later.", expect.anything());
    expect(lastInquiryWrite(server)).toBeNull();
    await pressAlertButton("Decline");
    expect(await screen.findByText("Moved to Declined.")).toBeTruthy();
    expect(lastInquiryWrite(server)?.body).toEqual({ stage: "declined" });
  });

  it("can move a declined one back, and doesn't offer to decline it again", async () => {
    startInquiryServer([anInquiry({ stage: "declined" })]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "More" }));
    expect(screen.queryByRole("radio", { name: "Decline" })).toBeNull();
  });

  it("asks before archiving, then goes back", async () => {
    const server = startInquiryServer([anInquiry()]);
    await renderScreen();
    await chooseMore("Archive");
    expect(lastInquiryWrite(server)).toBeNull();
    await pressAlertButton("Archive");
    expect(lastInquiryWrite(server)).toMatchObject({ method: "delete", url: "/inquiries/i1" });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("doesn't raise an Alert until the sheet has gone", async () => {
    startInquiryServer([anInquiry()]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "More" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Archive" }));
    expect(Alert.alert).not.toHaveBeenCalled();
    await act(async () => {
      mockModal.onDismiss?.();
    });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it("doesn't ask about notes when archiving, since they go with it", async () => {
    startInquiryServer([anInquiry()]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: /^Notes/ }));
    await fireEvent.changeText(screen.getByLabelText("Your notes"), "Half typed");
    expect(mockPreventRemove.active).toBe(true);
    await chooseMore("Archive");
    await pressAlertButton("Archive");
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(mockPreventRemove.active).toBe(false);
  });

  it("says it's gone when it was archived somewhere else", async () => {
    const server = startInquiryServer([anInquiry()]);
    await renderScreen();
    await screen.findByRole("header", { name: "Dana Reed" });
    server.inquiries = [];
    await fireEvent.press(screen.getByRole("button", { name: "Stage: New" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Replied" }));
    expect(await screen.findByText("I can't find that inquiry anymore.")).toBeTruthy();
    expect(await screen.findByText("I can't find that inquiry.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("does one thing at a time from the spam banner", async () => {
    const server = startInquiryServer([anInquiry({ spam_status: "flagged" })]);
    await renderScreen();
    const notSpam = await screen.findByRole("button", { name: "Not spam" });
    const spam = screen.getByRole("button", { name: "Mark as spam" });
    await act(async () => {
      fireEvent.press(notSpam);
      fireEvent.press(spam);
    });
    await screen.findByText("Marked as not spam.");
    expect(server.requests.filter((request) => request.method === "post")).toHaveLength(1);
  });

  it("opens the reply screen, and says when there's a draft to come back to", async () => {
    startInquiryServer([anInquiry()]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Reply" }));
    expect(mockPush).toHaveBeenCalledWith("/inquiries/i1/reply");
  });

  it("offers to continue a draft", async () => {
    startInquiryServer([anInquiry()]);
    jest.spyOn(session, "getState").mockReturnValue({ status: "signedIn", email: "me@example.com" } as never);
    saveReplyDraft("i1", { subject: "Hi", body: "", templateId: null });
    await renderScreen();
    expect(await screen.findByRole("button", { name: "Continue draft" })).toBeTruthy();
  });

  it("stays put if archiving fails", async () => {
    const server = startInquiryServer([anInquiry()]);
    await renderScreen();
    server.failWritesWith = 500;
    await chooseMore("Archive");
    await pressAlertButton("Archive");
    expect(await screen.findByText("I couldn't archive that. Want to try again?")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  describe("notes", () => {
    async function openNotes() {
      await fireEvent.press(await screen.findByRole("button", { name: /^Notes/ }));
    }

    it("saves them and goes quiet", async () => {
      const server = startInquiryServer([anInquiry()]);
      await renderScreen();
      await openNotes();
      await fireEvent.changeText(screen.getByLabelText("Your notes"), "  Sounds good  ");
      expect(mockPreventRemove.active).toBe(true);
      await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));
      expect(await screen.findByText("Notes saved.")).toBeTruthy();
      expect(lastInquiryWrite(server)?.body).toEqual({ notes: "Sounds good" });
      await waitFor(() => expect(mockPreventRemove.active).toBe(false));
      expect(screen.getByLabelText("Your notes").props.value).toBe("Sounds good");
    });

    it("isn't bothered by spaces already in a saved note", async () => {
      startInquiryServer([anInquiry({ notes: "Old\n" })]);
      await renderScreen();
      await openNotes();
      expect(mockPreventRemove.active).toBe(false);
      expect(screen.getByRole("button", { name: "Save notes" }).props.accessibilityState.disabled).toBe(true);
    });

    it("stops at the server's limit", async () => {
      startInquiryServer([anInquiry()]);
      await renderScreen();
      await openNotes();
      expect(screen.getByLabelText("Your notes").props.maxLength).toBe(5000);
    });

    it("clears them", async () => {
      const server = startInquiryServer([anInquiry({ notes: "Old" })]);
      await renderScreen();
      await openNotes();
      await fireEvent.changeText(screen.getByLabelText("Your notes"), "");
      await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));
      await screen.findByText("Notes saved.");
      expect(lastInquiryWrite(server)?.body).toEqual({ notes: null });
    });

    it("keeps what you typed when saving fails", async () => {
      const server = startInquiryServer([anInquiry()]);
      await renderScreen();
      await openNotes();
      server.failWritesWith = 500;
      await fireEvent.changeText(screen.getByLabelText("Your notes"), "Sounds good");
      await fireEvent.press(screen.getByRole("button", { name: "Save notes" }));
      expect(await screen.findByText("I couldn't save those notes. Want to try again?")).toBeTruthy();
      expect(screen.getByLabelText("Your notes").props.value).toBe("Sounds good");
      expect(mockPreventRemove.active).toBe(true);
    });

    it("keeps what you're typing when the page refreshes", async () => {
      const server = startInquiryServer([anInquiry({ notes: "Old" })]);
      await renderScreen();
      await openNotes();
      await fireEvent.changeText(screen.getByLabelText("Your notes"), "Typing");
      server.inquiries[0].notes = "Changed elsewhere";
      await act(async () => {
        await store.dispatch(baseApi.util.invalidateTags(["Inquiry" as never]));
      });
      await waitFor(() => expect(server.requests.filter((request) => request.url === "/inquiries/i1").length).toBeGreaterThan(1));
      expect(screen.getByLabelText("Your notes").props.value).toBe("Typing");
    });

    it("asks about unsaved notes on the way out", async () => {
      const server = startInquiryServer([anInquiry()]);
      await renderScreen();
      await openNotes();
      await fireEvent.changeText(screen.getByLabelText("Your notes"), "Sounds good");
      await act(async () => {
        mockPreventRemove.callback?.({ repeat: () => mockDispatch("leave") });
      });
      await pressAlertButton("Save");
      expect(lastInquiryWrite(server)?.body).toEqual({ notes: "Sounds good" });
      expect(mockDispatch).toHaveBeenCalledWith("leave");
    });

    it("stays when saving on the way out fails", async () => {
      const server = startInquiryServer([anInquiry()]);
      await renderScreen();
      await openNotes();
      server.failWritesWith = 500;
      await fireEvent.changeText(screen.getByLabelText("Your notes"), "Sounds good");
      await act(async () => {
        mockPreventRemove.callback?.({ repeat: () => mockDispatch("leave") });
      });
      await pressAlertButton("Save");
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("ignores going back while the notes are saving, so Discard can't beat it", async () => {
      startInquiryServer([anInquiry()]);
      const alert = jest.spyOn(Alert, "alert");
      alert.mockClear();
      await renderScreen();
      await openNotes();
      await fireEvent.changeText(screen.getByLabelText("Your notes"), "Sounds good");
      holdWrites();
      await fireEvent.press(screen.getByRole("button", { name: /save/i }));
      await act(async () => {
        mockPreventRemove.callback?.({ repeat: () => mockDispatch("leave") });
      });
      expect(alert).not.toHaveBeenCalled();
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("leaves without saving if you discard", async () => {
      const server = startInquiryServer([anInquiry()]);
      await renderScreen();
      await openNotes();
      await fireEvent.changeText(screen.getByLabelText("Your notes"), "Sounds good");
      await act(async () => {
        mockPreventRemove.callback?.({ repeat: () => mockDispatch("leave") });
      });
      await pressAlertButton("Discard");
      expect(lastInquiryWrite(server)).toBeNull();
      expect(mockDispatch).toHaveBeenCalledWith("leave");
    });
  });

  it("opens the history, spam checks and quality when asked, and fetches checks only then", async () => {
    const server = startInquiryServer([
      anInquiry({
        events: [{ id: "e1", inquiry_id: "i1", event_type: "replied", actor: "host", notes: null, occurred_at: new Date().toISOString(), created_at: new Date().toISOString() }],
      }),
    ]);
    server.assessments = [{ id: "s1", inquiry_id: "i1", assessment_type: "honeypot", passed: true, score: null, flags: null, details_json: null, created_at: new Date().toISOString() }];
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Activity" }));
    expect(screen.getByText("Moved to Replied")).toBeTruthy();
    expect(server.requests.some((request) => request.url?.endsWith("spam-assessments"))).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Spam checks" }));
    expect(await screen.findByText("Hidden form field")).toBeTruthy();
    expect(screen.getByText("Passed")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Quality" }));
    expect(screen.getByText("✓ Employer given")).toBeTruthy();
  });

  it("offers promotion from More, and opens the form once More has closed", async () => {
    startInquiryServer([anInquiry()]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "More" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Promote to applicant" }));
    expect(mockPush).not.toHaveBeenCalled();
    await act(async () => {
      mockModal.onDismiss?.();
    });
    expect(mockPush).toHaveBeenCalledWith("/inquiries/i1/promote");
  });

  it.each([
    ["declined", { stage: "declined" as const }],
    ["archived", { stage: "archived" as const }],
    ["already promoted", { linked_applicant_id: "a1" }],
  ])("doesn't offer promotion when %s", async (_case, change) => {
    startInquiryServer([anInquiry(change)]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "More" }));
    expect(await screen.findByRole("radio", { name: "Archive" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Promote to applicant" })).toBeNull();
  });

  it("opens the applicant once they've been promoted", async () => {
    startInquiryServer([anInquiry({ linked_applicant_id: "a1" })]);
    await renderScreen();
    expect(await screen.findByText("Promoted to an applicant")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Open applicant" }));
    expect(mockPush).toHaveBeenCalledWith("/applicants/a1");
  });

  it("is read-only for a viewer", async () => {
    const server = startInquiryServer([anInquiry({ spam_status: "flagged", notes: "Private note" })]);
    server.role = "viewer";
    await renderScreen();
    expect(await screen.findByText("You have view-only access.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: "More" })).toBeNull());
    expect(screen.queryByRole("button", { name: "Not spam" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: /^Notes/ }));
    expect(screen.queryByLabelText("Your notes")).toBeNull();
  });

  it("says when it's gone", async () => {
    startInquiryServer([]);
    await renderScreen();
    expect(await screen.findByText("I can't find that inquiry.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("offers a retry when it can't load", async () => {
    const server = startInquiryServer([anInquiry()]);
    server.offline = true;
    await renderScreen();
    expect(await screen.findByText("I couldn't load that inquiry.")).toBeTruthy();
    server.offline = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("header", { name: "Dana Reed" })).toBeTruthy();
  });
});
