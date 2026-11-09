import api from "@platform/core/lib/api";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { FORM_MESSAGES } from "../src/constants/forms";
import {
  WELCOME_MANUAL_EMAIL_MESSAGES as EMAIL, WELCOME_MANUAL_PREVIEW_MESSAGES as PREVIEW, WELCOME_MANUAL_SHARE_MESSAGES as SHARE, emailSentBody, filtersLabel, roomScopeLabel,
} from "../src/constants/welcomeManualForms";
import WelcomeManualEmailScreen from "../src/features/welcomeManuals/WelcomeManualEmailScreen";
import WelcomeManualPreviewScreen from "../src/features/welcomeManuals/WelcomeManualPreviewScreen";
import WelcomeManualShareScreen from "../src/features/welcomeManuals/WelcomeManualShareScreen";
import { aField, aManual, aPlace, aRoom, aSection } from "../test-support/aWelcomeManual";
import { pressAlertButton } from "../test-support/pressAlertButton";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";
import { startWelcomeManualsServer } from "../test-support/welcomeManualsServer";
import { writesTo } from "../test-support/writesTo";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockPreventRemove = { active: false, callback: null as null | ((event: { repeat: () => void }) => void) };
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: () => mockBack(), replace: (path: string) => mockReplace(path), canGoBack: () => mockCanGoBack() },
  usePreventRemove: (active: boolean, callback: (event: { repeat: () => void }) => void) => {
    mockPreventRemove.active = active;
    mockPreventRemove.callback = callback;
  },
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;
let alertSpy: jest.SpiedFunction<typeof Alert.alert>;
let shareSpy: jest.SpiedFunction<typeof Share.share>;

beforeEach(() => {
  resetSignedInStore();
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction", activityType: undefined });
  (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(true);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const shared = () => aManual({ share_token: "tok123", share_pin: "1234" });

describe("sharing a manual", () => {
  const open = () => renderScreen(<WelcomeManualShareScreen manualId="m1" />);

  it("offers to turn sharing on, and shows the link and the hidden code once it is", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual()] });
    await open();
    await screen.findByText(SHARE.off);
    await fireEvent.press(button(SHARE.enable));
    await screen.findByText(/\/guide\/tok123$/);
    expect(writesTo(server)).toEqual([{ method: "post", url: "/welcome-manuals/m1/share", body: {} }]);
    expect(screen.queryByText("1234")).toBeNull();
    await fireEvent.press(button("Show the full access code"));
    expect(screen.getByText("1234")).toBeTruthy();
  });

  it("copies the link and the code, and says so", async () => {
    startWelcomeManualsServer({ manuals: [shared()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: SHARE.copyLink }));
    await screen.findByText(SHARE.copiedLink);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringMatching(/\/guide\/tok123$/));
    await fireEvent.press(button(SHARE.copyCode));
    await screen.findByText(SHARE.copiedCode);
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith("1234");
  });

  it("says when the phone wouldn't take the copy", async () => {
    startWelcomeManualsServer({ manuals: [shared()] });
    (Clipboard.setStringAsync as jest.Mock).mockRejectedValue(new Error("no"));
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: SHARE.copyLink }));
    await screen.findByText(SHARE.copyFailed);
  });

  it("sends the link and the code through the phone's share sheet", async () => {
    startWelcomeManualsServer({ manuals: [shared()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: SHARE.send }));
    expect(shareSpy).toHaveBeenCalledWith({ message: expect.stringContaining("Access code: 1234") });
  });

  it("says when the share sheet won't open", async () => {
    startWelcomeManualsServer({ manuals: [shared()] });
    shareSpy.mockRejectedValue(new Error("no"));
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: SHARE.send }));
    await screen.findByText(SHARE.shareFailed);
  });

  it("makes a new code only after asking", async () => {
    const server = startWelcomeManualsServer({ manuals: [shared()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: SHARE.newCode }));
    expect(alertSpy).toHaveBeenCalledWith(SHARE.newCodeTitle, SHARE.newCodeBody, expect.anything(), expect.anything());
    expect(writesTo(server)).toHaveLength(0);
    pressAlertButton(alertSpy, SHARE.newCodeConfirm);
    await waitFor(() => expect(writesTo(server)).toEqual([{ method: "patch", url: "/welcome-manuals/m1/share", body: {} }]));
    await screen.findByText(SHARE.newCodeMade);
  });

  it("stops sharing only after asking", async () => {
    const server = startWelcomeManualsServer({ manuals: [shared()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: SHARE.revoke }));
    expect(writesTo(server)).toHaveLength(0);
    pressAlertButton(alertSpy, SHARE.revokeConfirm);
    await screen.findByText(SHARE.off);
    expect(writesTo(server)).toEqual([{ method: "delete", url: "/welcome-manuals/m1/share", body: {} }]);
  });

  it("explains a failure to turn sharing on", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual()] });
    server.failWhen = () => ({ status: 500, detail: "boom" });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: SHARE.enable }));
    await screen.findByText(/couldn't/i);
    expect(screen.getByRole("button", { name: SHARE.enable })).toBeTruthy();
  });

  it("lets a viewer copy and send, but not turn sharing on, change the code or stop it", async () => {
    startWelcomeManualsServer({ manuals: [shared()], role: "viewer" });
    await open();
    await screen.findByRole("button", { name: SHARE.copyLink });
    expect(screen.getByRole("button", { name: SHARE.send })).toBeTruthy();
    expect(screen.queryByRole("button", { name: SHARE.newCode })).toBeNull();
    expect(screen.queryByRole("button", { name: SHARE.revoke })).toBeNull();
  });

  it("gives a viewer no way to turn sharing on", async () => {
    startWelcomeManualsServer({ manuals: [aManual()], role: "viewer" });
    await open();
    await screen.findByText(SHARE.off);
    expect(screen.queryByRole("button", { name: SHARE.enable })).toBeNull();
  });
});

describe("previewing a manual", () => {
  const open = () => renderScreen(<WelcomeManualPreviewScreen manualId="m1" />);
  const roomy = () => aManual({
    intro_text: "Welcome home",
    rooms: [aRoom()],
    sections: [
      aSection({ id: "s1", title: "House rules", fields: [aField()] }),
      aSection({ id: "s2", title: "Blue room tips", room_id: "r1", display_order: 1, body: "Mind the step" }),
    ],
    places: [aPlace()],
  });

  it("shows the shared view first, with the intro, the shared sections and the places", async () => {
    startWelcomeManualsServer({ manuals: [roomy()] });
    await open();
    await screen.findByText("House rules");
    expect(screen.getByText("Welcome home")).toBeTruthy();
    expect(screen.queryByText("Blue room tips")).toBeNull();
    expect(screen.getByText(PREVIEW.placesHeading)).toBeTruthy();
  });

  it("switches to one room's emailed guide", async () => {
    startWelcomeManualsServer({ manuals: [roomy()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: new RegExp(PREVIEW.scopeLabel) }));
    await fireEvent.press(await screen.findByText(roomScopeLabel("Blue room")));
    await screen.findByText("Blue room tips");
    expect(screen.getByText("House rules")).toBeTruthy();
  });

  it("says there is nothing to show for an empty manual", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ intro_text: null })] });
    await open();
    await screen.findByText(PREVIEW.noSections);
  });

  it("offers a retry when the manual won't load, and recovers", async () => {
    const server = startWelcomeManualsServer({ manuals: [roomy()] });
    server.failReadsWith = 500;
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: /try again|retry/i }));
    server.failReadsWith = null;
    await fireEvent.press(await screen.findByRole("button", { name: /try again|retry/i }));
    await screen.findByText("House rules");
  });

  it("shows the intro as plain text, without the markdown marks", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ intro_text: "**Welcome** to the [lake house](https://x.example)", sections: [aSection()] })] });
    await open();
    await screen.findByText("Welcome to the lake house");
  });

  it("shows a field that has a label but no value yet", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ sections: [aSection({ fields: [aField({ label: "Door code", value: null })] })] })] });
    await open();
    await screen.findByText("Door code");
  });

  describe("the places directory", () => {
    const places = () => aManual({
      sections: [aSection()],
      places: [
        aPlace(),
        aPlace({ id: "pl2", name: "Pho House", cuisine: "Vietnamese", price_tier: "$$", note: "Try the broth", display_order: 1 }),
        aPlace({ id: "pl3", name: "Taqueria Sol", cuisine: "Mexican", price_tier: "$$", note: null, display_order: 2 }),
      ],
    });

    it("groups places by cuisine", async () => {
      startWelcomeManualsServer({ manuals: [places()] });
      await open();
      await screen.findByText("Pho House");
      expect(screen.getByText("Mexican")).toBeTruthy();
      expect(screen.getByText("Vietnamese")).toBeTruthy();
    });

    it("narrows by what is typed, looking at the note too, and says when nothing matches", async () => {
      startWelcomeManualsServer({ manuals: [places()] });
      await open();
      await fireEvent.changeText(await screen.findByLabelText(PREVIEW.searchLabel), "broth");
      expect(screen.getByText("Pho House")).toBeTruthy();
      expect(screen.queryByText("Taco Stand")).toBeNull();
      await fireEvent.changeText(screen.getByLabelText(PREVIEW.searchLabel), "zzz");
      expect(screen.getByText(PREVIEW.noMatches)).toBeTruthy();
    });

    it("narrows by cuisine and by price from the filter sheet, and clears them", async () => {
      startWelcomeManualsServer({ manuals: [places()] });
      await open();
      await fireEvent.press(await screen.findByRole("button", { name: PREVIEW.filters }));
      await fireEvent.press(screen.getByRole("radio", { name: "Mexican" }));
      await fireEvent.press(screen.getByRole("tab", { name: "$$" }));
      await fireEvent.press(screen.getByRole("button", { name: PREVIEW.done }));
      expect(screen.getByText("Taqueria Sol")).toBeTruthy();
      expect(screen.queryByText("Taco Stand")).toBeNull();
      expect(screen.queryByText("Pho House")).toBeNull();
      await fireEvent.press(screen.getByRole("button", { name: filtersLabel(2) }));
      await fireEvent.press(screen.getByRole("button", { name: PREVIEW.clearFilters }));
      await fireEvent.press(screen.getByRole("button", { name: PREVIEW.done }));
      expect(screen.getByText("Taco Stand")).toBeTruthy();
      expect(screen.getByText("Pho House")).toBeTruthy();
    });
  });
});

describe("emailing the guide", () => {
  const open = () => renderScreen(<WelcomeManualEmailScreen manualId="m1" />);
  const fill = async (email: string) => {
    await fireEvent.changeText(await screen.findByLabelText(`${EMAIL.emailLabel}, required`), email);
  };

  it("says to add a section first when there is nothing to send", async () => {
    startWelcomeManualsServer({ manuals: [aManual()] });
    await open();
    await screen.findByText(EMAIL.noSections);
    expect(screen.queryByRole("button", { name: EMAIL.send })).toBeNull();
  });

  it("sends it and says where it went", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ sections: [aSection()] })] });
    await open();
    await fill("guest@example.com");
    await fireEvent.changeText(screen.getByLabelText(EMAIL.nameLabel), "Gia");
    await fireEvent.press(button(EMAIL.send));
    await screen.findByText(emailSentBody("guest@example.com"));
    expect(writesTo(server)).toEqual([{ method: "post", url: "/welcome-manuals/m1/email", body: { recipient_email: "guest@example.com", recipient_name: "Gia", room_id: null } }]);
  });

  it("asks for a valid address, and sends nothing", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ sections: [aSection()] })] });
    await open();
    await fill("not-an-email");
    await fireEvent.press(button(EMAIL.send));
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(writesTo(server)).toHaveLength(0);
    expect(screen.queryByText(EMAIL.sentHeading)).toBeNull();
  });

  it("asks which room's guide on a by-the-room manual, and sends that room", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ rooms: [aRoom()], sections: [aSection()] })] });
    await open();
    await fill("guest@example.com");
    await fireEvent.press(button(EMAIL.send));
    expect(writesTo(server)).toHaveLength(0);
    await fireEvent.press(screen.getByRole("button", { name: new RegExp(EMAIL.roomLabel) }));
    await fireEvent.press(await screen.findByText("Blue room"));
    await fireEvent.press(button(EMAIL.send));
    await screen.findByText(EMAIL.sentHeading);
    expect(writesTo(server)[0].body).toMatchObject({ recipient_email: "guest@example.com", room_id: "r1" });
  });

  it("says plainly when the mail server refused it, and keeps what was typed", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ sections: [aSection()] })] });
    server.emailStatus = "failed";
    await open();
    await fill("guest@example.com");
    await fireEvent.press(button(EMAIL.send));
    await screen.findByText(EMAIL.failedHeading);
    await fireEvent.press(button(EMAIL.tryAgain));
    expect(screen.getByDisplayValue("guest@example.com")).toBeTruthy();
  });

  it("says plainly when email isn't set up", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ sections: [aSection()] })] });
    server.emailStatus = "skipped";
    await open();
    await fill("guest@example.com");
    await fireEvent.press(button(EMAIL.send));
    await screen.findByText(EMAIL.skippedHeading);
    expect(screen.getByText(EMAIL.skippedBody)).toBeTruthy();
  });

  it("sends to someone else with a cleared form", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ sections: [aSection()] })] });
    await open();
    await fill("guest@example.com");
    await fireEvent.press(button(EMAIL.send));
    await fireEvent.press(await screen.findByRole("button", { name: EMAIL.sendAnother }));
    expect(screen.queryByDisplayValue("guest@example.com")).toBeNull();
  });

  it("explains a demo account's refusal", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ sections: [aSection()] })] });
    server.failWhen = () => ({ status: 403, detail: "This feature is not available for demo accounts" });
    await open();
    await fill("guest@example.com");
    await fireEvent.press(button(EMAIL.send));
    await screen.findByText(EMAIL.demo);
  });

  it("says it may not have gone out when the phone is offline", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ sections: [aSection()] })] });
    await open();
    await fill("guest@example.com");
    server.offline = true;
    await fireEvent.press(button(EMAIL.send));
    await screen.findByText(/may not have gone out/i);
    expect(screen.getByRole("button", { name: EMAIL.send })).toBeTruthy();
  });

  it("asks before throwing away an address that wasn't sent", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ sections: [aSection()] })] });
    await open();
    expect(mockPreventRemove.active).toBe(false);
    await fill("guest@example.com");
    expect(mockPreventRemove.active).toBe(true);
    const leave = jest.fn();
    await act(async () => mockPreventRemove.callback?.({ repeat: leave }));
    expect(alertSpy.mock.calls.at(-1)?.slice(0, 2)).toEqual([FORM_MESSAGES.discardTitle, FORM_MESSAGES.discardBody]);
    await pressAlertButton(alertSpy, FORM_MESSAGES.discard);
    expect(leave).toHaveBeenCalled();
  });

  it("closes back to the screen behind it when Done is pressed", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ sections: [aSection()] })] });
    await open();
    await fill("guest@example.com");
    await fireEvent.press(button(EMAIL.send));
    await fireEvent.press(await screen.findByRole("button", { name: EMAIL.done }));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("goes to the manual instead when Done is pressed with no screen behind it", async () => {
    mockCanGoBack.mockReturnValue(false);
    startWelcomeManualsServer({ manuals: [aManual({ sections: [aSection()] })] });
    await open();
    await fill("guest@example.com");
    await fireEvent.press(button(EMAIL.send));
    await fireEvent.press(await screen.findByRole("button", { name: EMAIL.done }));
    expect(mockReplace).toHaveBeenCalledWith("/welcome-manuals/m1");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("can send the shared sections only, with no room, on a by-the-room manual", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ rooms: [aRoom()], sections: [aSection()] })] });
    await open();
    await fill("guest@example.com");
    await fireEvent.press(screen.getByRole("button", { name: new RegExp(EMAIL.roomLabel) }));
    await fireEvent.press(await screen.findByText(EMAIL.sharedOnly));
    await fireEvent.press(button(EMAIL.send));
    await screen.findByText(EMAIL.sentHeading);
    expect(writesTo(server)[0].body).toMatchObject({ recipient_email: "guest@example.com", room_id: null });
  });
});
