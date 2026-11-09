import api from "@platform/core/lib/api";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { UPLOAD_MESSAGES } from "../src/constants/uploads";
import {
  DELETE_PLACE_BODY, WELCOME_MANUAL_FIELD_MESSAGES as FIELD, WELCOME_MANUAL_PLACE_MESSAGES as PLACE, WELCOME_MANUAL_REORDER_MESSAGES as REORDER,
  WELCOME_MANUAL_ROOM_MESSAGES as ROOM, cuisineSuggestionLabel, deletePlaceTitle, deleteRoomTitle, moveDownLabel,
} from "../src/constants/welcomeManualForms";
import WelcomeManualFieldsScreen from "../src/features/welcomeManuals/WelcomeManualFieldsScreen";
import WelcomeManualPlacesScreen from "../src/features/welcomeManuals/WelcomeManualPlacesScreen";
import WelcomeManualRoomsScreen from "../src/features/welcomeManuals/WelcomeManualRoomsScreen";
import { aField, aManual, aPlace, aRoom, aSection } from "../test-support/aWelcomeManual";
import { holdWrites } from "../test-support/holdWrites";
import { pressAlertButton } from "../test-support/pressAlertButton";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";
import { startWelcomeManualsServer } from "../test-support/welcomeManualsServer";
import { writesTo } from "../test-support/writesTo";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePreventRemove: () => undefined,
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
const twoFields = () => [aField({ id: "f1", label: "Wi-Fi network", value: "Lakeview" }), aField({ id: "f2", label: "Password", value: null, display_order: 1 })];
const withFields = (fields = twoFields()) => aManual({ sections: [aSection({ fields })] });

describe("a section's label and value pairs", () => {
  const open = () => renderScreen(<WelcomeManualFieldsScreen manualId="m1" sectionId="s1" />);

  it("lists them, saying so when one has no value", async () => {
    startWelcomeManualsServer({ manuals: [withFields()] });
    await open();
    await screen.findByRole("button", { name: "Wi-Fi network, Lakeview" });
    expect(screen.getByRole("button", { name: "Password, no value" })).toBeTruthy();
  });

  it("offers to add the first one when there are none", async () => {
    startWelcomeManualsServer({ manuals: [withFields([])] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: FIELD.add }));
    expect(await screen.findByLabelText("Label, required")).toBeTruthy();
  });

  it("adds one, says so, and closes the sheet", async () => {
    const server = startWelcomeManualsServer({ manuals: [withFields()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: FIELD.add }));
    await fireEvent.changeText(screen.getByLabelText("Label, required"), " Parking ");
    await fireEvent.changeText(screen.getByLabelText(FIELD.valueLabel), "Driveway");
    await fireEvent.press(button(FIELD.addConfirm));
    await screen.findByText(FIELD.added);
    expect(writesTo(server)).toEqual([{ method: "post", url: "/welcome-manuals/m1/sections/s1/fields", body: { label: "Parking", value: "Driveway" } }]);
    await waitFor(() => expect(screen.queryByText(FIELD.valueLabel)).toBeNull());
  });

  it("asks for a label, and sends nothing", async () => {
    const server = startWelcomeManualsServer({ manuals: [withFields()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: FIELD.add }));
    await fireEvent.press(button(FIELD.addConfirm));
    expect(screen.getByText("Label is required.")).toBeTruthy();
    expect(writesTo(server)).toHaveLength(0);
  });

  it("shows the limit the server gives when the section is full", async () => {
    const server = startWelcomeManualsServer({ manuals: [withFields()] });
    server.failWhen = () => ({ status: 409, detail: "A section can have at most 20 fields" });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: FIELD.add }));
    await fireEvent.changeText(screen.getByLabelText("Label, required"), "Twentieth");
    await fireEvent.press(button(FIELD.addConfirm));
    await screen.findByText("A section can have at most 20 fields");
  });

  it("changes one, sending only what changed", async () => {
    const server = startWelcomeManualsServer({ manuals: [withFields()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Wi-Fi network, Lakeview" }));
    await fireEvent.changeText(screen.getByLabelText(FIELD.valueLabel), "Seaview");
    await fireEvent.press(button(FIELD.save));
    await screen.findByText(FIELD.saved);
    expect(writesTo(server)).toEqual([{ method: "patch", url: "/welcome-manuals/m1/sections/s1/fields/f1", body: { value: "Seaview" } }]);
  });

  it("clears a value that was emptied", async () => {
    const server = startWelcomeManualsServer({ manuals: [withFields()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Wi-Fi network, Lakeview" }));
    await fireEvent.changeText(screen.getByLabelText(FIELD.valueLabel), "");
    await fireEvent.press(button(FIELD.save));
    await screen.findByText(FIELD.saved);
    expect(writesTo(server)[0].body).toEqual({ value: null });
  });

  it("closes without sending when nothing changed", async () => {
    const server = startWelcomeManualsServer({ manuals: [withFields()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Wi-Fi network, Lakeview" }));
    await fireEvent.press(button(FIELD.save));
    await waitFor(() => expect(screen.queryByText(FIELD.valueLabel)).toBeNull());
    expect(writesTo(server)).toHaveLength(0);
  });

  it("asks before discarding a change, and keeps the sheet if told to keep editing", async () => {
    startWelcomeManualsServer({ manuals: [withFields()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Wi-Fi network, Lakeview" }));
    await fireEvent.changeText(screen.getByLabelText(FIELD.valueLabel), "Seaview");
    await fireEvent.press(button(FIELD.cancel));
    expect(alertSpy).toHaveBeenCalled();
    expect(screen.getByLabelText(FIELD.valueLabel).props.value).toBe("Seaview");
  });

  it("locks the sheet while saving, and sends once", async () => {
    const server = startWelcomeManualsServer({ manuals: [withFields()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Wi-Fi network, Lakeview" }));
    await fireEvent.changeText(screen.getByLabelText(FIELD.valueLabel), "Seaview");
    holdWrites();
    await fireEvent.press(button(FIELD.save));
    await fireEvent.press(button(FIELD.saving));
    expect(screen.getByLabelText(FIELD.valueLabel).props.editable).toBe(false);
    expect(writesTo(server)).toHaveLength(0);
  });

  it.each([
    [403, "You have view-only access, so I can't change this."],
    [404, "I can't find that field anymore. It may have been deleted."],
    [422, "Something in there isn't right. Check the fields and try again."],
    [500, "I couldn't save that. Want to try again?"],
  ])("keeps the sheet and says so in fixed words when saving fails with %s", async (status, message) => {
    const server = startWelcomeManualsServer({ manuals: [withFields()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Wi-Fi network, Lakeview" }));
    await fireEvent.changeText(screen.getByLabelText(FIELD.valueLabel), "Seaview");
    server.failWhen = () => ({ status, detail: "technical" });
    await fireEvent.press(button(FIELD.save));
    await screen.findByText(message);
    expect(screen.getByLabelText(FIELD.valueLabel).props.value).toBe("Seaview");
  });

  it("deletes after confirming, and treats one already deleted as done", async () => {
    const server = startWelcomeManualsServer({ manuals: [withFields()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Wi-Fi network, Lakeview" }));
    await fireEvent.press(button(FIELD.delete));
    expect(writesTo(server)).toHaveLength(0);
    await pressAlertButton(alertSpy, FIELD.delete);
    await screen.findByText(FIELD.deleted);
    expect(writesTo(server)).toEqual([{ method: "delete", url: "/welcome-manuals/m1/sections/s1/fields/f1", body: {} }]);

    await fireEvent.press(await screen.findByRole("button", { name: "Password, no value" }));
    await fireEvent.press(button(FIELD.delete));
    server.manuals[0].sections[0].fields = [];
    await pressAlertButton(alertSpy, FIELD.delete);
    await screen.findByText(FIELD.alreadyDeleted);
  });

  it("gives a viewer a plain list", async () => {
    startWelcomeManualsServer({ manuals: [withFields()], role: "viewer" });
    await open();
    await screen.findByText("Wi-Fi network");
    expect(screen.queryByRole("button", { name: FIELD.add })).toBeNull();
    expect(screen.queryByRole("button", { name: FIELD.reorder })).toBeNull();
    expect(screen.queryByRole("button", { name: "Wi-Fi network, Lakeview" })).toBeNull();
  });

  it("reorders in one request with the whole new order", async () => {
    const server = startWelcomeManualsServer({ manuals: [withFields()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: FIELD.reorder }));
    await fireEvent.press(button(moveDownLabel("Wi-Fi network")));
    await fireEvent.press(button(REORDER.save));
    await screen.findByText(REORDER.saved);
    expect(writesTo(server)).toEqual([{ method: "put", url: "/welcome-manuals/m1/sections/s1/fields/order", body: { field_ids: ["f2", "f1"] } }]);
  });

  it("reloads and says so when the list changed elsewhere", async () => {
    const server = startWelcomeManualsServer({ manuals: [withFields()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: FIELD.reorder }));
    await fireEvent.press(button(moveDownLabel("Wi-Fi network")));
    server.listChangedElsewhere = true;
    await fireEvent.press(button(REORDER.save));
    await screen.findByText(REORDER.stale);
  });
});

describe("a manual's rooms", () => {
  const open = () => renderScreen(<WelcomeManualRoomsScreen manualId="m1" />);

  it("lists them with how many sections each has", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ rooms: [aRoom()], sections: [aSection({ room_id: "r1" })] })] });
    await open();
    await screen.findByText("Blue room");
    expect(screen.getByText("1 section of its own")).toBeTruthy();
  });

  it("says the guide covers the whole place when there are none", async () => {
    startWelcomeManualsServer({ manuals: [aManual()] });
    await open();
    await screen.findByText(ROOM.none);
  });

  it("adds a room and renames one", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ rooms: [aRoom()] })] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: ROOM.add }));
    await fireEvent.changeText(screen.getByLabelText("Room name, required"), " Red room ");
    await fireEvent.press(button(ROOM.addConfirm));
    await screen.findByText(ROOM.added);
    await fireEvent.press(await screen.findByRole("button", { name: "Blue room" }));
    await fireEvent.changeText(screen.getByLabelText("Room name, required"), "Green room");
    await fireEvent.press(button(ROOM.save));
    await screen.findByText(ROOM.saved);
    expect(writesTo(server)).toEqual([
      { method: "post", url: "/welcome-manuals/m1/rooms", body: { name: "Red room" } },
      { method: "patch", url: "/welcome-manuals/m1/rooms/r1", body: { name: "Green room" } },
    ]);
  });

  it("asks for a name", async () => {
    startWelcomeManualsServer({ manuals: [aManual()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: ROOM.add }));
    await fireEvent.press(button(ROOM.addConfirm));
    expect(screen.getByText("Room name is required.")).toBeTruthy();
  });

  it("warns that its sections go too, and deletes after confirming", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ rooms: [aRoom()] })] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Blue room" }));
    await fireEvent.press(button(ROOM.delete));
    expect(alertSpy.mock.calls[0].slice(0, 2)).toEqual([deleteRoomTitle("Blue room"), ROOM.sectionsGoToo]);
    await pressAlertButton(alertSpy, ROOM.delete);
    await screen.findByText(ROOM.deleted);
    expect(writesTo(server)).toEqual([{ method: "delete", url: "/welcome-manuals/m1/rooms/r1", body: {} }]);
  });

  it("shows the limit the server gives when the manual is full of rooms", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ rooms: [aRoom()] })] });
    server.failWhen = () => ({ status: 409, detail: "A manual can have at most 20 rooms" });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: ROOM.add }));
    await fireEvent.changeText(screen.getByLabelText("Room name, required"), "One more");
    await fireEvent.press(button(ROOM.addConfirm));
    await screen.findByText("A manual can have at most 20 rooms");
  });

  it("gives a viewer a plain list", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ rooms: [aRoom()] })], role: "viewer" });
    await open();
    await screen.findByText("Blue room");
    expect(screen.queryByRole("button", { name: ROOM.add })).toBeNull();
    expect(screen.queryByRole("button", { name: "Blue room" })).toBeNull();
  });
});

describe("where to eat", () => {
  const open = () => renderScreen(<WelcomeManualPlacesScreen manualId="m1" />);

  it("lists places with cuisine and price", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ places: [aPlace()] })] });
    await open();
    await screen.findByRole("button", { name: "Taco Stand, Mexican · $" });
  });

  it("explains an empty list and offers to add", async () => {
    startWelcomeManualsServer({ manuals: [aManual()] });
    await open();
    await screen.findByText(PLACE.none);
    expect(screen.getByText(PLACE.noneBody)).toBeTruthy();
  });

  it("adds a place with a price tier and a map link", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: PLACE.add }));
    await fireEvent.changeText(screen.getByLabelText("Name, required"), "Noodle Bar");
    await fireEvent.changeText(screen.getByLabelText("Cuisine, required"), "Thai");
    await fireEvent.press(screen.getByRole("tab", { name: "$$" }));
    await fireEvent.changeText(screen.getByLabelText(PLACE.noteLabel), "Open late");
    await fireEvent.changeText(screen.getByLabelText(PLACE.mapLabel), "https://maps.example/noodle");
    await fireEvent.press(button(PLACE.addConfirm));
    await screen.findByText(PLACE.added);
    expect(writesTo(server)).toEqual([
      { method: "post", url: "/welcome-manuals/m1/places", body: { name: "Noodle Bar", cuisine: "Thai", price_tier: "$$", note: "Open late", map_url: "https://maps.example/noodle" } },
    ]);
  });

  it("rejects a map link that isn't a web address", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: PLACE.add }));
    await fireEvent.changeText(screen.getByLabelText("Name, required"), "Noodle Bar");
    await fireEvent.changeText(screen.getByLabelText("Cuisine, required"), "Thai");
    await fireEvent.changeText(screen.getByLabelText(PLACE.mapLabel), "javascript:alert(1)");
    await fireEvent.press(button(PLACE.addConfirm));
    expect(screen.getByText("Map link must start with http:// or https://.")).toBeTruthy();
    expect(writesTo(server)).toHaveLength(0);
  });

  it("changes only what changed, and can clear the price", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ places: [aPlace()] })] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Taco Stand, Mexican · $" }));
    await fireEvent.press(screen.getByRole("tab", { name: PLACE.noPrice }));
    await fireEvent.press(button(PLACE.save));
    await screen.findByText(PLACE.saved);
    expect(writesTo(server)).toEqual([{ method: "patch", url: "/welcome-manuals/m1/places/pl1", body: { price_tier: null } }]);
  });

  it("suggests cuisines the manual already uses while typing, and fills one in", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ places: [aPlace(), aPlace({ id: "pl2", name: "Pho House", cuisine: "Vietnamese" })] })] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: PLACE.add }));
    await fireEvent.changeText(screen.getByLabelText("Cuisine, required"), "mex");
    expect(screen.queryByRole("button", { name: cuisineSuggestionLabel("Vietnamese") })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: cuisineSuggestionLabel("Mexican") }));
    expect(screen.getByLabelText("Cuisine, required").props.value).toBe("Mexican");
  });

  it("locks the price choice while a save is on its way", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ places: [aPlace()] })] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Taco Stand, Mexican · $" }));
    await fireEvent.press(screen.getByRole("tab", { name: "$$" }));
    holdWrites();
    await fireEvent.press(button(PLACE.save));
    await fireEvent.press(button(PLACE.saving));
    expect(screen.getByRole("tab", { name: "$$" }).props.accessibilityState.disabled).toBe(true);
  });

  it("deletes after confirming", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual({ places: [aPlace()] })] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Taco Stand, Mexican · $" }));
    await fireEvent.press(button(PLACE.delete));
    expect(alertSpy.mock.calls[0].slice(0, 2)).toEqual([deletePlaceTitle("Taco Stand"), DELETE_PLACE_BODY]);
    await pressAlertButton(alertSpy, PLACE.delete);
    await screen.findByText(PLACE.deleted);
    expect(writesTo(server)[0]).toMatchObject({ method: "delete", url: "/welcome-manuals/m1/places/pl1" });
  });

  it("asks before discarding what was typed", async () => {
    startWelcomeManualsServer({ manuals: [aManual()] });
    await open();
    await fireEvent.press(await screen.findByRole("button", { name: PLACE.add }));
    await fireEvent.changeText(screen.getByLabelText("Name, required"), "Noodle");
    await fireEvent.press(button(PLACE.cancel));
    expect(alertSpy.mock.calls.at(-1)?.[0]).toBe(UPLOAD_MESSAGES.discardTitle);
    expect(screen.getByLabelText("Name, required").props.value).toBe("Noodle");
  });

  it("gives a viewer a plain list", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ places: [aPlace()] })], role: "viewer" });
    await open();
    await screen.findByText("Taco Stand");
    expect(screen.queryByRole("button", { name: PLACE.add })).toBeNull();
  });
});
