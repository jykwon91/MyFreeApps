import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { FORM_MESSAGES } from "../src/constants/forms";
import { DELETE_PROPERTY_BODY, deletePropertyTitle, PROPERTY_MESSAGES } from "../src/constants/properties";
import { PROPERTY_FORM_MESSAGES as FORM } from "../src/constants/propertyForm";
import PropertiesScreen from "../src/features/properties/PropertiesScreen";
import PropertyCreateScreen from "../src/features/properties/PropertyCreateScreen";
import PropertyDetailScreen from "../src/features/properties/PropertyDetailScreen";
import PropertyEditScreen from "../src/features/properties/PropertyEditScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aProperty, startPropertiesVendorsServer, writesOf } from "../test-support/propertiesVendorsServer";
import { holdWrites } from "../test-support/holdWrites";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPreventRemove = { active: false, callback: null as null | ((event: { repeat: () => void }) => void) };
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack(), replace: (path: string) => mockReplace(path), canGoBack: () => true },
  usePreventRemove: (active: boolean, callback: (event: { repeat: () => void }) => void) => {
    mockPreventRemove.active = active;
    mockPreventRemove.callback = callback;
  },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function show(element: React.ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

const serverWith = (properties = [aProperty()], role = "owner") => startPropertiesVendorsServer({ properties, role });
const button = (name: string) => screen.getByRole("button", { name });

async function confirmDelete() {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((candidate) => candidate.text === PROPERTY_MESSAGES.delete)?.onPress?.());
}

describe("the properties list", () => {
  it("opens a property when its row is tapped", async () => {
    serverWith();
    await show(<PropertiesScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: /^Elm House/ }));
    expect(mockPush).toHaveBeenCalledWith("/properties/p1");
  });

  it("lets someone who can write add a property", async () => {
    serverWith();
    await show(<PropertiesScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: PROPERTY_MESSAGES.add }));
    expect(mockPush).toHaveBeenCalledWith("/properties/new");
  });

  it("offers to add the first one when there are none", async () => {
    serverWith([]);
    await show(<PropertiesScreen />);
    await screen.findByText(PROPERTY_MESSAGES.noneHeading);
    expect(screen.getByText(PROPERTY_MESSAGES.noneBody)).toBeTruthy();
    await fireEvent.press(button(PROPERTY_MESSAGES.add));
    expect(mockPush).toHaveBeenCalledWith("/properties/new");
  });

  it("offers a viewer no way to add, but still lists what there is", async () => {
    serverWith([aProperty()], "viewer");
    await show(<PropertiesScreen />);
    await screen.findByText("Elm House");
    expect(screen.queryByRole("button", { name: PROPERTY_MESSAGES.add })).toBeNull();
  });

  it("tells a viewer with no properties that someone else adds them", async () => {
    serverWith([], "viewer");
    await show(<PropertiesScreen />);
    await screen.findByText(PROPERTY_MESSAGES.noneViewOnlyBody);
    expect(screen.queryByRole("button", { name: PROPERTY_MESSAGES.add })).toBeNull();
  });

  it("takes someone who can write straight to classifying the first property that needs it", async () => {
    serverWith([aProperty({ classification: "unclassified", type: null }), aProperty({ id: "p2", name: "Oak Flat", classification: "unclassified", type: null })]);
    await show(<PropertiesScreen />);
    await screen.findByText("2 properties need classifying.");
    await fireEvent.press(button(PROPERTY_MESSAGES.classify));
    expect(mockPush).toHaveBeenCalledWith("/properties/p1/edit");
  });

  it("only tells a viewer what needs classifying", async () => {
    serverWith([aProperty({ classification: "unclassified", type: null })], "viewer");
    await show(<PropertiesScreen />);
    await screen.findByText("1 property needs classifying.");
    expect(screen.queryByRole("button", { name: PROPERTY_MESSAGES.classify })).toBeNull();
  });
});

describe("a property's own screen", () => {
  it("shows what is known about it, with its active periods", async () => {
    serverWith([aProperty({ activity_periods: [{ id: 1, active_from: "2026-01-05", active_until: "2026-03-10" }] })]);
    await show(<PropertyDetailScreen id="p1" />);
    await screen.findByText("Elm House");
    expect(screen.getByText("1 Elm St, Austin, TX 78701")).toBeTruthy();
    expect(screen.getByText("Investment Property · Long-Term Rental")).toBeTruthy();
    expect(screen.getByText(PROPERTY_MESSAGES.activityPeriods)).toBeTruthy();
    expect(screen.getByText(/January 5, 2026 to March 10, 2026/)).toBeTruthy();
  });

  it("shows a skeleton while the first answer is on its way", async () => {
    serverWith();
    holdReads();
    await show(<PropertyDetailScreen id="p1" />);
    expect(await screen.findByTestId("property-detail-skeleton")).toBeTruthy();
  });

  it("opens the edit screen", async () => {
    serverWith();
    await show(<PropertyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: PROPERTY_MESSAGES.edit }));
    expect(mockPush).toHaveBeenCalledWith("/properties/p1/edit");
  });

  it("gives a viewer no buttons", async () => {
    serverWith([aProperty()], "viewer");
    await show(<PropertyDetailScreen id="p1" />);
    await screen.findByText("Elm House");
    for (const label of [PROPERTY_MESSAGES.edit, PROPERTY_MESSAGES.deactivate, PROPERTY_MESSAGES.delete]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("deactivates and reactivates a property, saying so each time", async () => {
    const server = serverWith();
    await show(<PropertyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: PROPERTY_MESSAGES.deactivate }));
    await screen.findByText(PROPERTY_MESSAGES.deactivated);
    expect(writesOf(server, "patch")).toEqual([{ url: "/properties/p1", body: { is_active: false } }]);
    await screen.findByText(PROPERTY_MESSAGES.inactive);
    await fireEvent.press(button(PROPERTY_MESSAGES.activate));
    await screen.findByText(PROPERTY_MESSAGES.activated);
    expect(writesOf(server, "patch")[1].body).toEqual({ is_active: true });
  });

  it("shows loading on the button at once, and sends one request however often it is tapped", async () => {
    const server = serverWith();
    await show(<PropertyDetailScreen id="p1" />);
    const toggle = await screen.findByRole("button", { name: PROPERTY_MESSAGES.deactivate });
    holdWrites();
    await fireEvent.press(toggle);
    await fireEvent.press(toggle);
    await screen.findByText(PROPERTY_MESSAGES.deactivating);
    expect(writesOf(server, "patch")).toHaveLength(0);
    expect(screen.getByRole("button", { name: PROPERTY_MESSAGES.edit }).props.accessibilityState.disabled).toBe(true);
  });

  it("asks before deleting, and does nothing if cancelled", async () => {
    const server = serverWith();
    await show(<PropertyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: PROPERTY_MESSAGES.delete }));
    expect(alertSpy.mock.calls[0].slice(0, 2)).toEqual([deletePropertyTitle("Elm House"), DELETE_PROPERTY_BODY]);
    expect(writesOf(server, "delete")).toHaveLength(0);
  });

  it("deletes after confirming, says so, and goes back", async () => {
    const server = serverWith();
    await show(<PropertyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: PROPERTY_MESSAGES.delete }));
    await confirmDelete();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesOf(server, "delete")).toEqual([{ url: "/properties/p1", body: {} }]);
    expect(screen.getByText(PROPERTY_MESSAGES.deleted)).toBeTruthy();
  });

  it.each([
    [403, "You have view-only access, so I can't delete this."],
    [409, "Something still depends on that property, so I couldn't delete it."],
    [500, "I couldn't delete that property. Want to try again?"],
  ])("says so in fixed words when deleting fails with %s, and stays", async (status, message) => {
    const server = serverWith();
    await show(<PropertyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: PROPERTY_MESSAGES.delete }));
    server.failWritesWith = status;
    await confirmDelete();
    await screen.findByText(message);
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: PROPERTY_MESSAGES.delete }).props.accessibilityState.disabled).toBeFalsy();
  });

  it("says it can't reach the server when offline", async () => {
    const server = serverWith();
    await show(<PropertyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: PROPERTY_MESSAGES.delete }));
    server.offline = true;
    await confirmDelete();
    await screen.findByText("I can't reach the server, so I couldn't delete that property.");
  });

  it("treats a property someone else already deleted as done", async () => {
    const server = serverWith();
    await show(<PropertyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: PROPERTY_MESSAGES.delete }));
    server.properties = [];
    await confirmDelete();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(screen.getByText(PROPERTY_MESSAGES.alreadyDeleted)).toBeTruthy();
  });

  it("says when the property is gone, and offers a way back", async () => {
    serverWith([]);
    await show(<PropertyDetailScreen id="p1" />);
    await screen.findByText(PROPERTY_MESSAGES.cantFind);
    await fireEvent.press(button(PROPERTY_MESSAGES.back));
    expect(mockBack).toHaveBeenCalled();
  });

  it("offers a retry when it couldn't load, and recovers", async () => {
    const server = serverWith();
    server.failReadsWith = 500;
    await show(<PropertyDetailScreen id="p1" />);
    await screen.findByText(PROPERTY_MESSAGES.couldntLoadOne);
    server.failReadsWith = null;
    await fireEvent.press(button(PROPERTY_MESSAGES.tryAgain));
    await screen.findByText("Elm House");
  });
});

describe("adding a property", () => {
  async function fillIn(name = "Beach House") {
    await fireEvent.changeText(screen.getByLabelText("Property name, required"), name);
    await fireEvent.changeText(screen.getByLabelText("Street address, required"), "6738 Peerless St");
    await fireEvent.changeText(screen.getByLabelText("City, required"), "Houston");
    await fireEvent.changeText(screen.getByLabelText("State, required"), "TX");
    await fireEvent.changeText(screen.getByLabelText("ZIP, required"), "77023");
  }

  it("shows a viewer that they can only look", async () => {
    serverWith([], "viewer");
    await show(<PropertyCreateScreen />);
    await screen.findByText(FORM_MESSAGES.viewOnlyHeading);
    expect(screen.queryByLabelText("Property name, required")).toBeNull();
  });

  it("asks for what is missing, and sends nothing", async () => {
    const server = serverWith([]);
    await show(<PropertyCreateScreen />);
    await screen.findByLabelText("Property name, required");
    await fireEvent.press(button(FORM.add));
    for (const text of ["Add a name.", "Add the street address.", "Add the city.", "Add the state.", "Add the ZIP code."]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(writesOf(server, "post")).toHaveLength(0);
  });

  it("adds an unclassified property by default, tells the person, and goes back", async () => {
    const server = serverWith([]);
    await show(<PropertyCreateScreen />);
    await screen.findByLabelText("Property name, required");
    await fillIn();
    await fireEvent.press(button(FORM.add));
    await screen.findByText(FORM.added);
    expect(writesOf(server, "post")).toEqual([
      { url: "/properties", body: { name: "Beach House", address: "6738 Peerless St, Houston, TX 77023", classification: "unclassified" } },
    ]);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("sends a rental type only for an investment, defaulting to short-term", async () => {
    const server = serverWith([]);
    await show(<PropertyCreateScreen />);
    await screen.findByLabelText("Property name, required");
    await fillIn();
    expect(screen.queryByRole("tab", { name: "Short-term" })).toBeNull();
    await fireEvent.press(button("Classification, Not Sure Yet"));
    await fireEvent.press(await screen.findByText("Investment Property"));
    expect(screen.getByRole("tab", { name: "Short-term", selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "Long-term" }));
    await fireEvent.press(button(FORM.add));
    await screen.findByText(FORM.added);
    expect(writesOf(server, "post")[0].body).toMatchObject({ classification: "investment", type: "long_term" });
  });

  it("drops the rental type when it stops being an investment", async () => {
    const server = serverWith([]);
    await show(<PropertyCreateScreen />);
    await screen.findByLabelText("Property name, required");
    await fillIn();
    await fireEvent.press(button("Classification, Not Sure Yet"));
    await fireEvent.press(await screen.findByText("Investment Property"));
    await fireEvent.press(button("Classification, Investment Property"));
    await fireEvent.press(await screen.findByText("Second Home"));
    expect(screen.queryByRole("tab", { name: "Short-term" })).toBeNull();
    await fireEvent.press(button(FORM.add));
    await screen.findByText(FORM.added);
    expect(writesOf(server, "post")[0].body).not.toHaveProperty("type");
  });

  it("trims what was typed", async () => {
    const server = serverWith([]);
    await show(<PropertyCreateScreen />);
    await screen.findByLabelText("Property name, required");
    await fillIn("  Beach House  ");
    await fireEvent.press(button(FORM.add));
    await screen.findByText(FORM.added);
    expect(writesOf(server, "post")[0].body.name).toBe("Beach House");
  });

  it("shows loading on the button at once, locks the fields, and sends once", async () => {
    const server = serverWith([]);
    await show(<PropertyCreateScreen />);
    await screen.findByLabelText("Property name, required");
    await fillIn();
    holdWrites();
    await fireEvent.press(button(FORM.add));
    await fireEvent.press(button(FORM.adding));
    expect(screen.getByLabelText("Property name, required").props.editable).toBe(false);
    expect(writesOf(server, "post")).toHaveLength(0);
    expect(screen.queryByText(FORM.added)).toBeNull();
  });

  it.each([
    [403, "You have view-only access, so I can't save this."],
    [409, "That clashes with a property you already have. Check the name and try again."],
    [422, "Something in there isn't right. Check the fields and try again."],
    [500, "I'm not sure that saved. Check your properties before trying again, so you don't end up with two."],
  ])("keeps the form and says so in fixed words when saving fails with %s", async (status, message) => {
    const server = serverWith([]);
    server.failWritesWith = status;
    await show(<PropertyCreateScreen />);
    await screen.findByLabelText("Property name, required");
    await fillIn();
    await fireEvent.press(button(FORM.add));
    await screen.findByText(message);
    expect(screen.getByLabelText("Property name, required").props.value).toBe("Beach House");
    expect(mockBack).not.toHaveBeenCalled();
    expect(button(FORM.add)).toBeTruthy();
  });

  it("warns about a possible double add when the answer is lost", async () => {
    const server = serverWith([]);
    server.offline = true;
    await show(<PropertyCreateScreen />);
    await screen.findByLabelText("Property name, required");
    await fillIn();
    await fireEvent.press(button(FORM.add));
    await screen.findByText(/I'm not sure that saved/);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("asks before discarding what was typed, and not when nothing was", async () => {
    serverWith([]);
    await show(<PropertyCreateScreen />);
    await screen.findByLabelText("Property name, required");
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(screen.getByLabelText("Property name, required"), "Beach");
    expect(mockPreventRemove.active).toBe(true);
    const leave = jest.fn();
    await act(async () => mockPreventRemove.callback?.({ repeat: leave }));
    expect(alertSpy.mock.calls.at(-1)?.slice(0, 2)).toEqual([FORM_MESSAGES.discardTitle, FORM_MESSAGES.discardBody]);
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((candidate) => candidate.text)).toEqual([FORM_MESSAGES.keepEditing, FORM_MESSAGES.discard]);
    await act(async () => buttons[1].onPress?.());
    expect(leave).toHaveBeenCalled();
  });
});

describe("changing a property", () => {
  it("starts from what is saved", async () => {
    serverWith();
    await show(<PropertyEditScreen id="p1" />);
    expect((await screen.findByLabelText("Property name, required")).props.value).toBe("Elm House");
    expect(screen.getByLabelText("Street address, required").props.value).toBe("1 Elm St");
    expect(screen.getByLabelText("City, required").props.value).toBe("Austin");
    expect(screen.getByLabelText("State, required").props.value).toBe("TX");
    expect(screen.getByLabelText("ZIP, required").props.value).toBe("78701");
    expect(screen.getByRole("tab", { name: "Long-term", selected: true })).toBeTruthy();
  });

  it("sends only what changed", async () => {
    const server = serverWith();
    await show(<PropertyEditScreen id="p1" />);
    await fireEvent.changeText(await screen.findByLabelText("Property name, required"), "Elm Cottage");
    await fireEvent.press(button(FORM.save));
    await screen.findByText(FORM.saved);
    expect(writesOf(server, "patch")).toEqual([{ url: "/properties/p1", body: { name: "Elm Cottage" } }]);
  });

  it("leaves a saved address alone when only the name changed, even if it is in another shape", async () => {
    const server = serverWith([aProperty({ address: "Unit 5, 1 Elm St, Austin, TX 78701" })]);
    await show(<PropertyEditScreen id="p1" />);
    await fireEvent.changeText(await screen.findByLabelText("Property name, required"), "Elm Cottage");
    await fireEvent.press(button(FORM.save));
    await screen.findByText(FORM.saved);
    expect(writesOf(server, "patch")[0].body).toEqual({ name: "Elm Cottage" });
  });

  it("classifies an unclassified property", async () => {
    const server = serverWith([aProperty({ classification: "unclassified", type: null })]);
    await show(<PropertyEditScreen id="p1" />);
    await screen.findByLabelText("Property name, required");
    await fireEvent.press(button("Classification, Not Sure Yet"));
    await fireEvent.press(await screen.findByText("Primary Residence"));
    await fireEvent.press(button(FORM.save));
    await screen.findByText(FORM.saved);
    expect(writesOf(server, "patch")[0].body).toEqual({ classification: "primary_residence" });
  });

  it("goes back without sending anything when nothing changed", async () => {
    const server = serverWith();
    await show(<PropertyEditScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: FORM.save }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesOf(server, "patch")).toHaveLength(0);
  });

  it("says when the property was deleted meanwhile, and keeps what was typed", async () => {
    const server = serverWith();
    await show(<PropertyEditScreen id="p1" />);
    await fireEvent.changeText(await screen.findByLabelText("Property name, required"), "Elm Cottage");
    server.properties = [];
    await fireEvent.press(button(FORM.save));
    await screen.findByText("I can't find that property anymore. It may have been deleted.");
    expect(screen.getByLabelText("Property name, required").props.value).toBe("Elm Cottage");
  });

  it("can't be reached by a viewer", async () => {
    serverWith([aProperty()], "viewer");
    await show(<PropertyEditScreen id="p1" />);
    await screen.findByText(FORM_MESSAGES.viewOnlyHeading);
  });

  it("says when the property isn't there", async () => {
    serverWith([]);
    await show(<PropertyEditScreen id="p1" />);
    await screen.findByText(PROPERTY_MESSAGES.cantFind);
  });
});

function holdReads() {
  api.defaults.adapter = () => new Promise(() => undefined);
}

