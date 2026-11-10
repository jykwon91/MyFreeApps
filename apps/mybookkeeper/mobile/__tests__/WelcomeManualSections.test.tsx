import { WELCOME_MANUAL_MAX_SECTIONS } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import api from "@platform/core/lib/api";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { FORM_MESSAGES } from "../src/constants/forms";
import { DELETE_SECTION_BODY, WELCOME_MANUAL_REORDER_MESSAGES as REORDER, WELCOME_MANUAL_SECTION_MESSAGES as SECTION, deleteSectionTitle, moveDownLabel, moveUpLabel } from "../src/constants/welcomeManualForms";
import WelcomeManualSectionCreateScreen from "../src/features/welcomeManuals/WelcomeManualSectionCreateScreen";
import WelcomeManualSectionDetailScreen from "../src/features/welcomeManuals/WelcomeManualSectionDetailScreen";
import WelcomeManualSectionEditScreen from "../src/features/welcomeManuals/WelcomeManualSectionEditScreen";
import WelcomeManualSectionsScreen from "../src/features/welcomeManuals/WelcomeManualSectionsScreen";
import { aField, aManual, anImage, aRoom, aSection } from "../test-support/aWelcomeManual";
import { holdWrites } from "../test-support/holdWrites";
import { pressAlertButton } from "../test-support/pressAlertButton";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";
import { startWelcomeManualsServer } from "../test-support/welcomeManualsServer";
import { writesTo } from "../test-support/writesTo";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockPreventRemove = { active: false, callback: null as null | ((event: { repeat: () => void }) => void) };
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack(), replace: jest.fn(), canGoBack: () => true },
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
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

const button = (name: string) => screen.getByRole("button", { name });
const twoSections = () => [aSection({ id: "s1", title: "Wi-Fi", fields: [aField()] }), aSection({ id: "s2", title: "Parking", display_order: 1, body: null })];

describe("the sections of a manual", () => {
  it("lists them with what is in each, and opens one", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ sections: twoSections() })] });
    await renderScreen(<WelcomeManualSectionsScreen id="m1" />);
    await fireEvent.press(await screen.findByRole("button", { name: /^Wi-Fi, 1 field · 0 photos/ }));
    expect(mockPush).toHaveBeenCalledWith("/welcome-manuals/m1/sections/s1");
  });

  it("stops offering to add once the manual has the most sections it can hold", async () => {
    const full = Array.from({ length: WELCOME_MANUAL_MAX_SECTIONS }, (_, i) => aSection({ id: `s${i}`, title: `Section ${i}`, display_order: i }));
    startWelcomeManualsServer({ manuals: [aManual({ sections: full })] });
    await renderScreen(<WelcomeManualSectionsScreen id="m1" />);
    await screen.findByText(SECTION.atLimit);
    expect(screen.queryByRole("button", { name: SECTION.add })).toBeNull();
  });

  it("names the room a section belongs to", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ rooms: [aRoom()], sections: [aSection({ room_id: "r1" })] })] });
    await renderScreen(<WelcomeManualSectionsScreen id="m1" />);
    await screen.findByText("Blue room");
  });

  it("offers to add the first one when there are none", async () => {
    startWelcomeManualsServer({ manuals: [aManual()] });
    await renderScreen(<WelcomeManualSectionsScreen id="m1" />);
    await fireEvent.press(await screen.findByRole("button", { name: SECTION.add }));
    expect(mockPush).toHaveBeenCalledWith("/welcome-manuals/m1/sections/new");
  });

  it("gives a viewer nothing to add or reorder", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ sections: twoSections() })], role: "viewer" });
    await renderScreen(<WelcomeManualSectionsScreen id="m1" />);
    await screen.findByText("Wi-Fi");
    expect(screen.queryByRole("button", { name: SECTION.add })).toBeNull();
    expect(screen.queryByRole("button", { name: SECTION.reorder })).toBeNull();
  });

  it("offers a retry when the manual won't load, and recovers", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ sections: twoSections() })] });
    server.failReadsWith = 500;
    await renderScreen(<WelcomeManualSectionsScreen id="m1" />);
    await screen.findByText("I couldn't load this manual.");
    server.failReadsWith = null;
    await fireEvent.press(button("Try again"));
    await screen.findByText("Wi-Fi");
  });
});

describe("reordering sections", () => {
  async function openReorder() {
    await renderScreen(<WelcomeManualSectionsScreen id="m1" />);
    await fireEvent.press(await screen.findByRole("button", { name: SECTION.reorder }));
  }

  it("moves with the arrows and sends the whole new order once, when saved", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ sections: twoSections() })] });
    await openReorder();
    await fireEvent.press(button(moveUpLabel("Parking")));
    expect(writesTo(server)).toHaveLength(0);
    await fireEvent.press(button(REORDER.save));
    await screen.findByText(REORDER.saved);
    expect(writesTo(server)).toEqual([{ method: "put", url: "/welcome-manuals/m1/sections/order", body: { section_ids: ["s2", "s1"] } }]);
  });

  it("won't move the first one up or the last one down", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ sections: twoSections() })] });
    await openReorder();
    expect(button(moveUpLabel("Wi-Fi")).props.accessibilityState.disabled).toBe(true);
    expect(button(moveDownLabel("Parking")).props.accessibilityState.disabled).toBe(true);
    expect(button(REORDER.save).props.accessibilityState.disabled).toBe(true);
  });

  it("asks before discarding a reorder that wasn't saved", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ sections: twoSections() })] });
    await openReorder();
    await fireEvent.press(button(moveDownLabel("Wi-Fi")));
    await fireEvent.press(button(REORDER.cancel));
    expect(alertSpy).toHaveBeenCalled();
  });

  it("closes a reorder nothing was changed in without asking", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ sections: twoSections() })] });
    await openReorder();
    await fireEvent.press(button(REORDER.cancel));
    expect(alertSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(REORDER.hint)).toBeNull());
  });

  it("reloads the list and says so when it changed elsewhere", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ sections: twoSections() })] });
    await openReorder();
    await fireEvent.press(button(moveDownLabel("Wi-Fi")));
    server.manuals[0].sections.pop();
    await fireEvent.press(button(REORDER.save));
    await screen.findByText(REORDER.stale);
    await waitFor(() => expect(screen.queryByText(REORDER.hint)).toBeNull());
    expect(screen.queryByText("Parking")).toBeNull();
  });

  it("keeps the order and says so in fixed words when saving fails", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ sections: twoSections() })] });
    await openReorder();
    await fireEvent.press(button(moveDownLabel("Wi-Fi")));
    server.failWhen = () => ({ status: 500, detail: "technical" });
    await fireEvent.press(button(REORDER.save));
    await screen.findByText("I couldn't save the new order. Want to try again?");
    expect(button(REORDER.save).props.accessibilityState.disabled).toBe(false);
    server.failWhen = null;
    await fireEvent.press(button(REORDER.save));
    await screen.findByText(REORDER.saved);
  });

  it("sends nothing twice while a save is on its way", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ sections: twoSections() })] });
    await openReorder();
    await fireEvent.press(button(moveDownLabel("Wi-Fi")));
    holdWrites();
    await fireEvent.press(button(REORDER.save));
    await fireEvent.press(button(REORDER.saving));
    expect(writesTo(server)).toHaveLength(0);
  });
});

describe("adding a section", () => {
  it("can't be reached by a viewer", async () => {
    startWelcomeManualsServer({ manuals: [aManual()], role: "viewer" });
    await renderScreen(<WelcomeManualSectionCreateScreen manualId="m1" />);
    await screen.findByText(FORM_MESSAGES.viewOnlyHeading);
  });

  it("asks for a title, and sends nothing", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual()] });
    await renderScreen(<WelcomeManualSectionCreateScreen manualId="m1" />);
    await fireEvent.press(await screen.findByRole("button", { name: SECTION.add }));
    expect(screen.getByText("Title is required.")).toBeTruthy();
    expect(writesTo(server)).toHaveLength(0);
  });

  it("adds it, says so, and goes back", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual()] });
    await renderScreen(<WelcomeManualSectionCreateScreen manualId="m1" />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), " Trash day ");
    await fireEvent.changeText(screen.getByLabelText(SECTION.bodyLabel), "Tuesday morning");
    await fireEvent.press(button(SECTION.add));
    await screen.findByText(SECTION.added);
    expect(writesTo(server)).toMatchObject([{ method: "post", url: "/welcome-manuals/m1/sections", body: { title: "Trash day", body: "Tuesday morning" } }]);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("offers a scope only when the manual has rooms, and sends the room chosen", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ rooms: [aRoom()] })] });
    await renderScreen(<WelcomeManualSectionCreateScreen manualId="m1" />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "Room rules");
    await fireEvent.press(button(`${SECTION.scopeLabel}, ${SECTION.everyone}`));
    await fireEvent.press(await screen.findByRole("radio", { name: "Blue room" }));
    await fireEvent.press(button(SECTION.add));
    await screen.findByText(SECTION.added);
    expect(writesTo(server)[0].body.room_id).toBe("r1");
  });

  it("has no scope to choose on a manual without rooms", async () => {
    startWelcomeManualsServer({ manuals: [aManual()] });
    await renderScreen(<WelcomeManualSectionCreateScreen manualId="m1" />);
    await screen.findByLabelText("Title, required");
    expect(screen.queryByText(SECTION.scopeLabel)).toBeNull();
  });

  it("shows the limit the server gives when it's reached", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual()] });
    server.failWhen = () => ({ status: 409, detail: "A manual can have at most 50 sections" });
    await renderScreen(<WelcomeManualSectionCreateScreen manualId="m1" />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "One more");
    await fireEvent.press(button(SECTION.add));
    await screen.findByText("A manual can have at most 50 sections");
  });

  it("asks before discarding what was typed", async () => {
    startWelcomeManualsServer({ manuals: [aManual()] });
    await renderScreen(<WelcomeManualSectionCreateScreen manualId="m1" />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "Trash");
    expect(mockPreventRemove.active).toBe(true);
    await act(async () => mockPreventRemove.callback?.({ repeat: jest.fn() }));
    expect(alertSpy.mock.calls.at(-1)?.slice(0, 2)).toEqual([FORM_MESSAGES.discardTitle, FORM_MESSAGES.discardBody]);
  });
});

describe("changing a section", () => {
  it("sends only what changed", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ sections: twoSections() })] });
    await renderScreen(<WelcomeManualSectionEditScreen manualId="m1" sectionId="s1" />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "Internet");
    await fireEvent.press(button(SECTION.save));
    await screen.findByText(SECTION.saved);
    expect(writesTo(server)).toEqual([{ method: "patch", url: "/welcome-manuals/m1/sections/s1", body: { title: "Internet" } }]);
  });

  it("sends nothing when nothing changed", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ sections: twoSections() })] });
    await renderScreen(<WelcomeManualSectionEditScreen manualId="m1" sectionId="s1" />);
    await fireEvent.press(await screen.findByRole("button", { name: SECTION.save }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesTo(server)).toHaveLength(0);
  });

  it("says the section isn't there when it was deleted", async () => {
    startWelcomeManualsServer({ manuals: [aManual()] });
    await renderScreen(<WelcomeManualSectionEditScreen manualId="m1" sectionId="gone" />);
    await screen.findByText(SECTION.cantFind);
  });
});

describe("one section", () => {
  const withPhotos = () => aManual({ sections: [aSection({ fields: [aField()], images: [anImage(), anImage({ id: "i2" })] })] });

  it("shows its text and rows for its fields and photos", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos()] });
    await renderScreen(<WelcomeManualSectionDetailScreen manualId="m1" sectionId="s1" />);
    await screen.findByText("Getting online");
    expect(screen.getByText("Router is in the closet.")).toBeTruthy();
    await fireEvent.press(button("Label and value pairs, 1 field"));
    expect(mockPush).toHaveBeenCalledWith("/welcome-manuals/m1/sections/s1/fields");
    await fireEvent.press(button("Photos, 2 photos"));
    expect(mockPush).toHaveBeenCalledWith("/welcome-manuals/m1/sections/s1/photos");
    await fireEvent.press(button(SECTION.edit));
    expect(mockPush).toHaveBeenCalledWith("/welcome-manuals/m1/sections/s1/edit");
  });

  it("gives a viewer no edit or delete", async () => {
    startWelcomeManualsServer({ manuals: [withPhotos()], role: "viewer" });
    await renderScreen(<WelcomeManualSectionDetailScreen manualId="m1" sectionId="s1" />);
    await screen.findByText("Getting online");
    expect(screen.queryByRole("button", { name: SECTION.edit })).toBeNull();
    expect(screen.queryByRole("button", { name: SECTION.delete })).toBeNull();
  });

  it("asks before deleting, then deletes and goes back", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos()] });
    await renderScreen(<WelcomeManualSectionDetailScreen manualId="m1" sectionId="s1" />);
    await fireEvent.press(await screen.findByRole("button", { name: SECTION.delete }));
    expect(alertSpy.mock.calls[0].slice(0, 2)).toEqual([deleteSectionTitle("Getting online"), DELETE_SECTION_BODY]);
    expect(writesTo(server)).toHaveLength(0);
    await pressAlertButton(alertSpy, SECTION.delete);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesTo(server)).toEqual([{ method: "delete", url: "/welcome-manuals/m1/sections/s1", body: {} }]);
  });

  it("says so in fixed words when deleting fails, and stays", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos()] });
    await renderScreen(<WelcomeManualSectionDetailScreen manualId="m1" sectionId="s1" />);
    await fireEvent.press(await screen.findByRole("button", { name: SECTION.delete }));
    server.failWhen = () => ({ status: 500, detail: "technical" });
    await pressAlertButton(alertSpy, SECTION.delete);
    await screen.findByText("I couldn't delete that section. Want to try again?");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("treats a section someone else already deleted as done", async () => {
    const server = startWelcomeManualsServer({ manuals: [withPhotos()] });
    await renderScreen(<WelcomeManualSectionDetailScreen manualId="m1" sectionId="s1" />);
    await fireEvent.press(await screen.findByRole("button", { name: SECTION.delete }));
    server.manuals[0].sections = [];
    await pressAlertButton(alertSpy, SECTION.delete);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});
