import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { FORM_MESSAGES } from "../src/constants/forms";
import { VENDOR_FORM_MESSAGES as FORM } from "../src/constants/vendorForm";
import { DELETE_VENDOR_BODY, deleteVendorTitle, VENDOR_MESSAGES } from "../src/constants/vendors";
import VendorCreateScreen from "../src/features/vendors/VendorCreateScreen";
import VendorDetailScreen from "../src/features/vendors/VendorDetailScreen";
import VendorEditScreen from "../src/features/vendors/VendorEditScreen";
import VendorsScreen from "../src/features/vendors/VendorsScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { holdWrites } from "../test-support/holdWrites";
import { aVendor, startPropertiesVendorsServer, writesOf } from "../test-support/propertiesVendorsServer";

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

const serverWith = (vendors = [aVendor()], role = "owner") => startPropertiesVendorsServer({ vendors, role });
const button = (name: string) => screen.getByRole("button", { name });

async function confirmDelete() {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((candidate) => candidate.text === VENDOR_MESSAGES.delete)?.onPress?.());
}

describe("the vendors list", () => {
  it("lets someone who can write add a vendor", async () => {
    serverWith();
    await show(<VendorsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_MESSAGES.add }));
    expect(mockPush).toHaveBeenCalledWith("/vendors/new");
  });

  it("offers to add the first one when there are none", async () => {
    serverWith([]);
    await show(<VendorsScreen />);
    await screen.findByText(VENDOR_MESSAGES.noneHeading);
    expect(screen.getByText(VENDOR_MESSAGES.noneBody)).toBeTruthy();
    await fireEvent.press(button(VENDOR_MESSAGES.add));
    expect(mockPush).toHaveBeenCalledWith("/vendors/new");
  });

  it("offers a viewer no way to add", async () => {
    serverWith([aVendor()], "viewer");
    await show(<VendorsScreen />);
    await screen.findByText("Reliable Plumbing");
    expect(screen.queryByRole("button", { name: VENDOR_MESSAGES.add })).toBeNull();
  });

  it("tells a viewer with no vendors that someone else adds them", async () => {
    serverWith([], "viewer");
    await show(<VendorsScreen />);
    await screen.findByText(VENDOR_MESSAGES.noneViewOnlyBody);
    expect(screen.queryByRole("button", { name: VENDOR_MESSAGES.add })).toBeNull();
  });
});

describe("a vendor's own screen", () => {
  it("shows when the vendor was last used, or that they never were", async () => {
    serverWith([aVendor()]);
    await show(<VendorDetailScreen id="v1" />);
    await screen.findByText(VENDOR_MESSAGES.neverUsed);
  });

  it("gives a viewer no buttons or switch to change anything", async () => {
    serverWith([aVendor()], "viewer");
    await show(<VendorDetailScreen id="v1" />);
    await screen.findByText("Reliable Plumbing");
    expect(screen.queryByRole("button", { name: VENDOR_MESSAGES.edit })).toBeNull();
    expect(screen.queryByRole("button", { name: VENDOR_MESSAGES.delete })).toBeNull();
    expect(screen.queryByLabelText(VENDOR_MESSAGES.preferred)).toBeNull();
  });

  it("opens the edit screen", async () => {
    serverWith();
    await show(<VendorDetailScreen id="v1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_MESSAGES.edit }));
    expect(mockPush).toHaveBeenCalledWith("/vendors/v1/edit");
  });

  it("stars and unstars a vendor, saying so each time", async () => {
    const server = serverWith();
    await show(<VendorDetailScreen id="v1" />);
    await fireEvent(await screen.findByLabelText(VENDOR_MESSAGES.preferred), "valueChange", true);
    await screen.findByText(VENDOR_MESSAGES.markedPreferred);
    expect(writesOf(server, "patch")).toEqual([{ url: "/vendors/v1", body: { preferred: true } }]);
    await waitFor(() => expect(screen.getByLabelText(VENDOR_MESSAGES.preferred).props.value).toBe(true));
    await fireEvent(screen.getByLabelText(VENDOR_MESSAGES.preferred), "valueChange", false);
    await screen.findByText(VENDOR_MESSAGES.unmarkedPreferred);
    expect(writesOf(server, "patch")[1].body).toEqual({ preferred: false });
  });

  it("locks the screen while a change is on its way, and sends it once", async () => {
    const server = serverWith();
    await show(<VendorDetailScreen id="v1" />);
    const row = await screen.findByLabelText(VENDOR_MESSAGES.preferred);
    holdWrites();
    await fireEvent(row, "valueChange", true);
    await fireEvent(row, "valueChange", true);
    expect(screen.getByRole("button", { name: VENDOR_MESSAGES.edit }).props.accessibilityState.disabled).toBe(true);
    expect(writesOf(server, "patch")).toHaveLength(0);
  });

  it("keeps the switch where it was and says so when starring fails", async () => {
    const server = serverWith();
    await show(<VendorDetailScreen id="v1" />);
    const row = await screen.findByLabelText(VENDOR_MESSAGES.preferred);
    server.failWritesWith = 500;
    await fireEvent(row, "valueChange", true);
    await screen.findByText("I couldn't save that. Want to try again?");
    expect(screen.getByLabelText(VENDOR_MESSAGES.preferred).props.value).toBe(false);
  });

  it("asks before deleting, and does nothing if cancelled", async () => {
    const server = serverWith();
    await show(<VendorDetailScreen id="v1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_MESSAGES.delete }));
    expect(alertSpy.mock.calls[0].slice(0, 2)).toEqual([deleteVendorTitle("Reliable Plumbing"), DELETE_VENDOR_BODY]);
    expect(writesOf(server, "delete")).toHaveLength(0);
  });

  it("deletes after confirming, says so, and goes back", async () => {
    const server = serverWith();
    await show(<VendorDetailScreen id="v1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_MESSAGES.delete }));
    await confirmDelete();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesOf(server, "delete")).toEqual([{ url: "/vendors/v1", body: {} }]);
    expect(screen.getByText(VENDOR_MESSAGES.deleted)).toBeTruthy();
  });

  it.each([
    [403, "You have view-only access, so I can't delete this."],
    [409, "Something still depends on that vendor, so I couldn't delete it."],
    [500, "I couldn't delete that vendor. Want to try again?"],
  ])("says so in fixed words when deleting fails with %s, and stays", async (status, message) => {
    const server = serverWith();
    await show(<VendorDetailScreen id="v1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_MESSAGES.delete }));
    server.failWritesWith = status;
    await confirmDelete();
    await screen.findByText(message);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("says it can't reach the server when offline", async () => {
    const server = serverWith();
    await show(<VendorDetailScreen id="v1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_MESSAGES.delete }));
    server.offline = true;
    await confirmDelete();
    await screen.findByText("I can't reach the server, so I couldn't delete that vendor.");
  });

  it("treats a vendor someone else already deleted as done", async () => {
    const server = serverWith();
    await show(<VendorDetailScreen id="v1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_MESSAGES.delete }));
    server.vendors = [];
    await confirmDelete();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(screen.getByText(VENDOR_MESSAGES.alreadyDeleted)).toBeTruthy();
  });
});

describe("adding a vendor", () => {
  const nameInput = () => screen.getByLabelText("Name, required");

  it("shows a viewer that they can only look", async () => {
    serverWith([], "viewer");
    await show(<VendorCreateScreen />);
    await screen.findByText(FORM_MESSAGES.viewOnlyHeading);
    expect(screen.queryByLabelText("Name, required")).toBeNull();
  });

  it("asks for a name, and sends nothing", async () => {
    const server = serverWith([]);
    await show(<VendorCreateScreen />);
    await screen.findByLabelText("Name, required");
    await fireEvent.press(button(FORM.add));
    expect(screen.getByText("Add a name.")).toBeTruthy();
    expect(writesOf(server, "post")).toHaveLength(0);
  });

  it("rejects an email and a rate that can't be right", async () => {
    const server = serverWith([]);
    await show(<VendorCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Name, required"), "Bright Electric");
    await fireEvent.changeText(screen.getByLabelText("Email"), "not-an-email");
    await fireEvent.changeText(screen.getByLabelText(FORM.hourlyRate), "ninety");
    await fireEvent.press(button(FORM.add));
    expect(screen.getByText("That doesn't look like an email address.")).toBeTruthy();
    expect(screen.getByText("Enter the rate as dollars, like 95 or 95.50.")).toBeTruthy();
    expect(writesOf(server, "post")).toHaveLength(0);
  });

  it("adds a vendor with everything filled in, tells the person, and goes back", async () => {
    const server = serverWith([]);
    await show(<VendorCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Name, required"), "  Bright Electric ");
    await fireEvent.press(button("Category, Handyman"));
    await fireEvent.press(await screen.findByRole("radio", { name: "Electrician" }));
    await fireEvent.changeText(screen.getByLabelText("Phone"), "555-0101");
    await fireEvent.changeText(screen.getByLabelText("Email"), "hi@bright.example");
    await fireEvent.changeText(screen.getByLabelText("Address"), "9 Wire Way");
    await fireEvent.changeText(screen.getByLabelText(FORM.hourlyRate), "85.50");
    await fireEvent.changeText(screen.getByLabelText(FORM.flatRates), "Flat $100 for an outlet");
    await fireEvent(screen.getByLabelText(FORM.preferred), "valueChange", true);
    await fireEvent.changeText(screen.getByLabelText("Notes"), "Ask for Priya");
    await fireEvent.press(button(FORM.add));
    await screen.findByText(FORM.added);
    expect(writesOf(server, "post")).toEqual([
      {
        url: "/vendors",
        body: {
          name: "Bright Electric",
          category: "electrician",
          phone: "555-0101",
          email: "hi@bright.example",
          address: "9 Wire Way",
          hourly_rate: "85.50",
          flat_rate_notes: "Flat $100 for an outlet",
          preferred: true,
          notes: "Ask for Priya",
        },
      },
    ]);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("sends empty optional fields as nothing", async () => {
    const server = serverWith([]);
    await show(<VendorCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Name, required"), "Bright Electric");
    await fireEvent.press(button(FORM.add));
    await screen.findByText(FORM.added);
    expect(writesOf(server, "post")[0].body).toEqual({
      name: "Bright Electric",
      category: "handyman",
      phone: null,
      email: null,
      address: null,
      hourly_rate: null,
      flat_rate_notes: null,
      preferred: false,
      notes: null,
    });
  });

  it("shows loading on the button at once, locks the fields, and sends once", async () => {
    const server = serverWith([]);
    await show(<VendorCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Name, required"), "Bright Electric");
    holdWrites();
    await fireEvent.press(button(FORM.add));
    await fireEvent.press(button(FORM.adding));
    expect(nameInput().props.editable).toBe(false);
    expect(writesOf(server, "post")).toHaveLength(0);
    expect(screen.queryByText(FORM.added)).toBeNull();
  });

  it.each([
    [403, "You have view-only access, so I can't save this."],
    [409, "That clashes with a vendor you already have. Check the name and try again."],
    [422, "Something in there isn't right. Check the fields and try again."],
    [500, "I'm not sure that saved. Check your vendors before trying again, so you don't end up with two."],
  ])("keeps the form and says so in fixed words when saving fails with %s", async (status, message) => {
    const server = serverWith([]);
    server.failWritesWith = status;
    await show(<VendorCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Name, required"), "Bright Electric");
    await fireEvent.press(button(FORM.add));
    await screen.findByText(message);
    expect(nameInput().props.value).toBe("Bright Electric");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("warns about a possible double add when the answer is lost", async () => {
    const server = serverWith([]);
    server.loseAnswerAfterSaving = true;
    await show(<VendorCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Name, required"), "Bright Electric");
    await fireEvent.press(button(FORM.add));
    await screen.findByText(/I'm not sure that saved/);
    expect(server.vendors).toHaveLength(1);
  });

  it("asks before discarding what was typed, and not when nothing was", async () => {
    serverWith([]);
    await show(<VendorCreateScreen />);
    await screen.findByLabelText("Name, required");
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(nameInput(), "Bright");
    expect(mockPreventRemove.active).toBe(true);
    const leave = jest.fn();
    await act(async () => mockPreventRemove.callback?.({ repeat: leave }));
    expect(alertSpy.mock.calls.at(-1)?.slice(0, 2)).toEqual([FORM_MESSAGES.discardTitle, FORM_MESSAGES.discardBody]);
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons[1].onPress?.());
    expect(leave).toHaveBeenCalled();
  });
});

describe("changing a vendor", () => {
  it("starts from what is saved", async () => {
    serverWith();
    await show(<VendorEditScreen id="v1" />);
    expect((await screen.findByLabelText("Name, required")).props.value).toBe("Reliable Plumbing");
    expect(screen.getByLabelText("Phone").props.value).toBe("(555) 010-1000");
    expect(screen.getByLabelText(FORM.hourlyRate).props.value).toBe("95.00");
    expect(screen.getByRole("button", { name: "Category, Plumber" })).toBeTruthy();
  });

  it("sends only what changed, and clears a field that was emptied", async () => {
    const server = serverWith();
    await show(<VendorEditScreen id="v1" />);
    await fireEvent.changeText(await screen.findByLabelText("Name, required"), "Reliable Pipes");
    await fireEvent.changeText(screen.getByLabelText("Notes"), "");
    await fireEvent.press(button(FORM.save));
    await screen.findByText(FORM.saved);
    expect(writesOf(server, "patch")).toEqual([{ url: "/vendors/v1", body: { name: "Reliable Pipes", notes: null } }]);
  });

  it("goes back without sending anything when nothing changed", async () => {
    const server = serverWith();
    await show(<VendorEditScreen id="v1" />);
    await fireEvent.press(await screen.findByRole("button", { name: FORM.save }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesOf(server, "patch")).toHaveLength(0);
  });

  it("says when the vendor was deleted meanwhile, and keeps what was typed", async () => {
    const server = serverWith();
    await show(<VendorEditScreen id="v1" />);
    await fireEvent.changeText(await screen.findByLabelText("Name, required"), "Reliable Pipes");
    server.vendors = [];
    await fireEvent.press(button(FORM.save));
    await screen.findByText("I can't find that vendor anymore. It may have been deleted.");
    expect(screen.getByLabelText("Name, required").props.value).toBe("Reliable Pipes");
  });

  it("can't be reached by a viewer", async () => {
    serverWith([aVendor()], "viewer");
    await show(<VendorEditScreen id="v1" />);
    await screen.findByText(FORM_MESSAGES.viewOnlyHeading);
  });

  it("says when the vendor isn't there, and offers a way back", async () => {
    serverWith([]);
    await show(<VendorEditScreen id="v1" />);
    await screen.findByText(VENDOR_MESSAGES.cantFind);
    await fireEvent.press(button(VENDOR_MESSAGES.back));
    expect(mockBack).toHaveBeenCalled();
  });

  it("offers a retry when it couldn't load, and recovers", async () => {
    const server = serverWith();
    server.failReadsWith = 500;
    await show(<VendorEditScreen id="v1" />);
    await screen.findByText(VENDOR_MESSAGES.couldntLoadOne);
    server.failReadsWith = null;
    await fireEvent.press(button(VENDOR_MESSAGES.tryAgain));
    await screen.findByLabelText("Name, required");
  });
});
