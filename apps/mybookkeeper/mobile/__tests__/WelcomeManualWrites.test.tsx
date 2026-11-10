import api from "@platform/core/lib/api";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { FORM_MESSAGES } from "../src/constants/forms";
import { WELCOME_MANUAL_FORM_MESSAGES as FORM } from "../src/constants/welcomeManualForms";
import { DELETE_MANUAL_BODY, WELCOME_MANUAL_MESSAGES, deleteManualTitle } from "../src/constants/welcomeManuals";
import WelcomeManualCreateScreen from "../src/features/welcomeManuals/WelcomeManualCreateScreen";
import WelcomeManualDetailScreen from "../src/features/welcomeManuals/WelcomeManualDetailScreen";
import WelcomeManualEditScreen from "../src/features/welcomeManuals/WelcomeManualEditScreen";
import { aManual, aSection } from "../test-support/aWelcomeManual";
import { holdWrites } from "../test-support/holdWrites";
import { pressAlertButton } from "../test-support/pressAlertButton";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";
import { startWelcomeManualsServer } from "../test-support/welcomeManualsServer";
import { writesTo } from "../test-support/writesTo";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockPreventRemove = { active: false, callback: null as null | ((event: { repeat: () => void }) => void) };
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack(), replace: (path: string) => mockReplace(path), canGoBack: () => mockCanGoBack() },
  usePreventRemove: (active: boolean, callback: (event: { repeat: () => void }) => void) => {
    mockPreventRemove.active = active;
    mockPreventRemove.callback = callback;
  },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;
let alertSpy: jest.SpiedFunction<typeof Alert.alert>;

beforeEach(() => {
  resetSignedInStore();
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const titleInput = () => screen.getByLabelText("Title, required");

describe("making a manual", () => {
  it("can't be reached by a viewer", async () => {
    startWelcomeManualsServer({ role: "viewer" });
    await renderScreen(<WelcomeManualCreateScreen />);
    await screen.findByText(FORM_MESSAGES.viewOnlyHeading);
  });

  it("asks for a title, and sends nothing", async () => {
    const server = startWelcomeManualsServer();
    await renderScreen(<WelcomeManualCreateScreen />);
    await screen.findByLabelText("Title, required");
    await fireEvent.press(button(FORM.create));
    expect(screen.getByText("Title is required.")).toBeTruthy();
    expect(writesTo(server)).toHaveLength(0);
  });

  it("creates it with the usual sections, says so, and opens it in place of the form", async () => {
    const server = startWelcomeManualsServer();
    await renderScreen(<WelcomeManualCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "  Lake cabin  ");
    expect(screen.queryByLabelText(FORM.introLabel)).toBeNull();
    await fireEvent.press(button(FORM.create));
    await screen.findByText(FORM.created);
    const [write] = writesTo(server);
    expect(write).toMatchObject({ method: "post", url: "/welcome-manuals", body: { title: "Lake cabin", seed_default_sections: true } });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/welcome-manuals/made1"));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("can start empty instead of with the usual sections", async () => {
    const server = startWelcomeManualsServer();
    await renderScreen(<WelcomeManualCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "Lake cabin");
    await fireEvent(screen.getByLabelText(FORM.seedLabel), "valueChange", false);
    await fireEvent.press(button(FORM.create));
    await screen.findByText(FORM.created);
    expect(writesTo(server)[0].body.seed_default_sections).toBe(false);
  });

  it("shows loading on the button at once, locks the field, and sends once", async () => {
    const server = startWelcomeManualsServer();
    await renderScreen(<WelcomeManualCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "Lake cabin");
    holdWrites();
    await fireEvent.press(button(FORM.create));
    await fireEvent.press(button(FORM.creating));
    expect(titleInput().props.editable).toBe(false);
    expect(writesTo(server)).toHaveLength(0);
  });

  it.each([
    [403, "You have view-only access, so I can't change this."],
    [422, "Something in there isn't right. Check the fields and try again."],
    [500, "I'm not sure that saved. Check your manuals before trying again, so you don't end up with two."],
  ])("keeps the form and says so in fixed words when saving fails with %s", async (status, message) => {
    const server = startWelcomeManualsServer();
    server.failWhen = () => ({ status, detail: "technical detail" });
    await renderScreen(<WelcomeManualCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "Lake cabin");
    await fireEvent.press(button(FORM.create));
    await screen.findByText(message);
    expect(titleInput().props.value).toBe("Lake cabin");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("says it can't reach the server, and tries again on request", async () => {
    const server = startWelcomeManualsServer();
    await renderScreen(<WelcomeManualCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "Lake cabin");
    server.offline = true;
    await fireEvent.press(button(FORM.create));
    await screen.findByText(/I'm not sure that saved/);
    server.offline = false;
    await fireEvent.press(button(FORM.create));
    await screen.findByText(FORM.created);
  });

  it("asks before discarding what was typed, and not when nothing was", async () => {
    startWelcomeManualsServer();
    await renderScreen(<WelcomeManualCreateScreen />);
    await screen.findByLabelText("Title, required");
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(titleInput(), "Lake");
    expect(mockPreventRemove.active).toBe(true);
    const leave = jest.fn();
    await act(async () => mockPreventRemove.callback?.({ repeat: leave }));
    expect(alertSpy.mock.calls.at(-1)?.slice(0, 2)).toEqual([FORM_MESSAGES.discardTitle, FORM_MESSAGES.discardBody]);
    await pressAlertButton(alertSpy, FORM_MESSAGES.discard);
    expect(leave).toHaveBeenCalled();
  });
});

describe("changing a manual", () => {
  const manual = () => aManual({ title: "Beach House guide", intro_text: "Hello", property_id: "pr1" });

  it("starts from what is saved", async () => {
    startWelcomeManualsServer({ manuals: [manual()] });
    await renderScreen(<WelcomeManualEditScreen id="m1" />);
    expect((await screen.findByLabelText("Title, required")).props.value).toBe("Beach House guide");
    expect(screen.getByLabelText(FORM.introLabel).props.value).toBe("Hello");
    expect(await screen.findByRole("button", { name: "Property, Oak Street" })).toBeTruthy();
  });

  it("sends only what changed, and clears an introduction that was emptied", async () => {
    const server = startWelcomeManualsServer({ manuals: [manual()] });
    await renderScreen(<WelcomeManualEditScreen id="m1" />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "Lake guide");
    await fireEvent.changeText(screen.getByLabelText(FORM.introLabel), "");
    await fireEvent.press(button(FORM.save));
    await screen.findByText(FORM.saved);
    expect(writesTo(server)).toEqual([{ method: "put", url: "/welcome-manuals/m1", body: { title: "Lake guide", intro_text: null } }]);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("goes back without sending anything when nothing changed", async () => {
    const server = startWelcomeManualsServer({ manuals: [manual()] });
    await renderScreen(<WelcomeManualEditScreen id="m1" />);
    await fireEvent.press(await screen.findByRole("button", { name: FORM.save }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesTo(server)).toHaveLength(0);
  });

  it("compares with the snapshot from when it opened, not a later reload", async () => {
    const server = startWelcomeManualsServer({ manuals: [manual()] });
    await renderScreen(<WelcomeManualEditScreen id="m1" />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "Lake guide");
    server.manuals[0].title = "Changed by someone else";
    await fireEvent.changeText(titleInput(), "Beach House guide");
    await fireEvent.press(button(FORM.save));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesTo(server)).toHaveLength(0);
  });

  it("says the manual is gone when it was deleted meanwhile", async () => {
    const server = startWelcomeManualsServer({ manuals: [manual()] });
    await renderScreen(<WelcomeManualEditScreen id="m1" />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "Lake guide");
    server.manuals = [];
    await fireEvent.press(button(FORM.save));
    await screen.findByText(WELCOME_MANUAL_MESSAGES.cantFind);
    expect(button(WELCOME_MANUAL_MESSAGES.back)).toBeTruthy();
  });

  it("can't be reached by a viewer", async () => {
    startWelcomeManualsServer({ manuals: [manual()], role: "viewer" });
    await renderScreen(<WelcomeManualEditScreen id="m1" />);
    await screen.findByText(FORM_MESSAGES.viewOnlyHeading);
  });

  it("offers a retry when it couldn't load, and recovers", async () => {
    const server = startWelcomeManualsServer({ manuals: [manual()] });
    server.failReadsWith = 500;
    await renderScreen(<WelcomeManualEditScreen id="m1" />);
    await screen.findByText(WELCOME_MANUAL_MESSAGES.couldntLoadOne);
    server.failReadsWith = null;
    await fireEvent.press(button(WELCOME_MANUAL_MESSAGES.tryAgain));
    await screen.findByLabelText("Title, required");
  });
});

describe("a manual at a glance", () => {
  it("shows the manual and a row for each part, with what is behind it", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ property_id: "pr1", sections: [aSection()], share_token: "t", share_pin: "1234" })] });
    await renderScreen(<WelcomeManualDetailScreen id="m1" />);
    await screen.findByText("Beach House guide");
    await screen.findByText("Oak Street");
    expect(screen.getByText("Welcome to the beach house.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sections, 1 section" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rooms, 0 rooms" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Where to eat, 0 places" })).toBeTruthy();
    expect(screen.getByRole("button", { name: `${WELCOME_MANUAL_MESSAGES.shareRow}, ${WELCOME_MANUAL_MESSAGES.shared}` })).toBeTruthy();
  });

  it.each([
    [WELCOME_MANUAL_MESSAGES.sectionsRow, "sections"],
    [WELCOME_MANUAL_MESSAGES.roomsRow, "rooms"],
    [WELCOME_MANUAL_MESSAGES.placesRow, "places"],
    [WELCOME_MANUAL_MESSAGES.shareRow, "share"],
    [WELCOME_MANUAL_MESSAGES.previewRow, "preview"],
    [WELCOME_MANUAL_MESSAGES.emailRow, "email"],
    [WELCOME_MANUAL_MESSAGES.edit, "edit"],
  ])("opens %s on its own screen", async (label, path) => {
    startWelcomeManualsServer({ manuals: [aManual({ sections: [aSection()] })] });
    await renderScreen(<WelcomeManualDetailScreen id="m1" />);
    await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`^${label}`) }));
    expect(mockPush).toHaveBeenCalledWith(`/welcome-manuals/m1/${path}`);
  });

  it("won't open the email screen for a manual with nothing to send", async () => {
    startWelcomeManualsServer({ manuals: [aManual()] });
    await renderScreen(<WelcomeManualDetailScreen id="m1" />);
    const row = await screen.findByRole("button", { name: new RegExp(`^${WELCOME_MANUAL_MESSAGES.emailRow}`) });
    expect(row.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(WELCOME_MANUAL_MESSAGES.noEmailWithoutSections)).toBeTruthy();
  });

  it("gives a viewer rows to look at, but no way to change, delete or email", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ sections: [aSection()] })], role: "viewer" });
    await renderScreen(<WelcomeManualDetailScreen id="m1" />);
    await screen.findByText("Beach House guide");
    expect(screen.getByRole("button", { name: /^Sections/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: WELCOME_MANUAL_MESSAGES.edit })).toBeNull();
    expect(screen.queryByRole("button", { name: WELCOME_MANUAL_MESSAGES.delete })).toBeNull();
    expect(screen.queryByRole("button", { name: new RegExp(`^${WELCOME_MANUAL_MESSAGES.emailRow}`) })).toBeNull();
  });

  it("asks before deleting, and does nothing if cancelled", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual()] });
    await renderScreen(<WelcomeManualDetailScreen id="m1" />);
    await fireEvent.press(await screen.findByRole("button", { name: WELCOME_MANUAL_MESSAGES.delete }));
    expect(alertSpy.mock.calls[0].slice(0, 2)).toEqual([deleteManualTitle("Beach House guide"), DELETE_MANUAL_BODY]);
    expect(writesTo(server)).toHaveLength(0);
  });

  it("deletes after confirming, says so, and goes back", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual()] });
    await renderScreen(<WelcomeManualDetailScreen id="m1" />);
    await fireEvent.press(await screen.findByRole("button", { name: WELCOME_MANUAL_MESSAGES.delete }));
    await pressAlertButton(alertSpy, WELCOME_MANUAL_MESSAGES.delete);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesTo(server)).toEqual([{ method: "delete", url: "/welcome-manuals/m1", body: {} }]);
    expect(screen.queryByText("Beach House guide")).toBeNull();
  });

  it.each([
    [403, "You have view-only access, so I can't change this."],
    [500, "I couldn't delete that manual. Want to try again?"],
  ])("says so in fixed words when deleting fails with %s, and stays", async (status, message) => {
    const server = startWelcomeManualsServer({ manuals: [aManual()] });
    await renderScreen(<WelcomeManualDetailScreen id="m1" />);
    await fireEvent.press(await screen.findByRole("button", { name: WELCOME_MANUAL_MESSAGES.delete }));
    server.failWhen = () => ({ status, detail: "technical" });
    await pressAlertButton(alertSpy, WELCOME_MANUAL_MESSAGES.delete);
    await screen.findByText(message);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("treats a manual someone else already deleted as done", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual()] });
    await renderScreen(<WelcomeManualDetailScreen id="m1" />);
    await fireEvent.press(await screen.findByRole("button", { name: WELCOME_MANUAL_MESSAGES.delete }));
    server.manuals = [];
    await pressAlertButton(alertSpy, WELCOME_MANUAL_MESSAGES.delete);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("says when the manual is gone, and offers a way back", async () => {
    startWelcomeManualsServer();
    await renderScreen(<WelcomeManualDetailScreen id="nope" />);
    await screen.findByText(WELCOME_MANUAL_MESSAGES.cantFind);
    await fireEvent.press(button(WELCOME_MANUAL_MESSAGES.back));
    expect(mockBack).toHaveBeenCalled();
  });

  it("goes to the list instead when a link was opened cold and there is nothing behind it", async () => {
    mockCanGoBack.mockReturnValue(false);
    startWelcomeManualsServer();
    await renderScreen(<WelcomeManualDetailScreen id="nope" />);
    await fireEvent.press(await screen.findByRole("button", { name: WELCOME_MANUAL_MESSAGES.back }));
    expect(mockReplace).toHaveBeenCalledWith("/welcome-manuals");
    expect(mockBack).not.toHaveBeenCalled();
  });
});
