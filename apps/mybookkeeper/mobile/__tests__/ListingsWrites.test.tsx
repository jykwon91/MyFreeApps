import { listingsApi } from "@mybookkeeper/api-client/store/listingsApi";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { FORM_MESSAGES } from "../src/constants/forms";
import { LISTING_FORM_MESSAGES as FORM } from "../src/constants/listingForm";
import { deleteListingTitle, LISTING_MESSAGES } from "../src/constants/listings";
import ListingCreateScreen from "../src/features/listings/ListingCreateScreen";
import ListingDetailScreen from "../src/features/listings/ListingDetailScreen";
import ListingEditScreen from "../src/features/listings/ListingEditScreen";
import ListingsScreen from "../src/features/listings/ListingsScreen";
import { store } from "../src/lib/store";
import { holdWrites } from "../test-support/holdWrites";
import { aListing, startListingsServer, writesTo } from "../test-support/listingsServer";
import { mockPreventRemove, mockRouter, pressAlertButton, restoreApi, show, signInToWorkspace } from "../test-support/listingsHarness";

jest.mock("expo-router", () => jest.requireActual("../test-support/listingsHarness").expoRouterMock());
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  alertSpy = signInToWorkspace();
});
afterEach(restoreApi);

const button = (name: string) => screen.getByRole("button", { name });

describe("the listings list", () => {
  it("lets someone who can write start a new listing", async () => {
    startListingsServer();
    await show(<ListingsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: LISTING_MESSAGES.add }));
    expect(mockRouter.push).toHaveBeenCalledWith("/listings/new");
  });

  it("offers to add the first one when there are none", async () => {
    startListingsServer({ listings: [] });
    await show(<ListingsScreen />);
    await screen.findByText(LISTING_MESSAGES.noneHeading);
    await fireEvent.press(button(LISTING_MESSAGES.add));
    expect(mockRouter.push).toHaveBeenCalledWith("/listings/new");
  });

  it("gives a viewer no way to add", async () => {
    startListingsServer({ role: "viewer" });
    await show(<ListingsScreen />);
    await screen.findByText("Garden room");
    expect(screen.queryByRole("button", { name: LISTING_MESSAGES.add })).toBeNull();
  });
});

describe("a listing's own screen", () => {
  it("shows a property row, the counts, and opens the property", async () => {
    startListingsServer();
    await show(<ListingDetailScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Property, Elm House" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/properties/p1");
  });

  it("copies the inquiry link and says so", async () => {
    startListingsServer();
    await show(<ListingDetailScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: LISTING_MESSAGES.copyLink }));
    await screen.findByText(LISTING_MESSAGES.linkCopied);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining("/apply/garden-room"));
  });

  it("opens the photos, links and channels on their own screens", async () => {
    startListingsServer();
    await show(<ListingDetailScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Photos, No photos yet" }));
    await fireEvent.press(screen.getByRole("button", { name: "Other sites, Not linked anywhere" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Channels, 0 channels" }));
    expect(mockRouter.push.mock.calls.map((call) => call[0])).toEqual(["/listings/l1/photos", "/listings/l1/links", "/listings/l1/channels"]);
  });

  it("gives a viewer no buttons to change anything", async () => {
    startListingsServer({ role: "viewer" });
    await show(<ListingDetailScreen id="l1" />);
    await screen.findByText("Garden room");
    for (const name of [LISTING_MESSAGES.edit, LISTING_MESSAGES.changeStatus, LISTING_MESSAGES.delete]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("opens the edit screen", async () => {
    startListingsServer();
    await show(<ListingDetailScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: LISTING_MESSAGES.edit }));
    expect(mockRouter.push).toHaveBeenCalledWith("/listings/l1/edit");
  });

  it("changes only the status, and says so", async () => {
    const server = startListingsServer();
    await show(<ListingDetailScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: LISTING_MESSAGES.changeStatus }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Paused" }));
    await screen.findByText(LISTING_MESSAGES.statusChanged);
    expect(writesTo(server, "put")).toEqual([{ url: "/listings/l1", body: { status: "paused" } }]);
    await screen.findByLabelText("Status: Paused");
  });

  it("says so when the status change fails, and keeps the old status", async () => {
    const server = startListingsServer();
    await show(<ListingDetailScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: LISTING_MESSAGES.changeStatus }));
    server.failWrites.push({ match: "/listings/l1", status: 500 });
    await fireEvent.press(await screen.findByRole("radio", { name: "Archived" }));
    await screen.findByText("I couldn't save that. Want to try again?");
    expect(screen.getByLabelText("Status: Active")).toBeTruthy();
  });

  it("asks before deleting, and says what happens", async () => {
    const server = startListingsServer();
    await show(<ListingDetailScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: LISTING_MESSAGES.delete }));
    expect(alertSpy.mock.calls[0].slice(0, 2)).toEqual([deleteListingTitle("Garden room"), LISTING_MESSAGES.deleteBody]);
    expect(writesTo(server, "delete")).toHaveLength(0);
  });

  it("deletes after confirming, says so, and goes back", async () => {
    const server = startListingsServer();
    await show(<ListingDetailScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: LISTING_MESSAGES.delete }));
    await pressAlertButton(alertSpy, LISTING_MESSAGES.delete, act);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(writesTo(server, "delete")).toEqual([{ url: "/listings/l1", body: {} }]);
    expect(screen.getByText(LISTING_MESSAGES.deleted)).toBeTruthy();
  });

  it.each([
    [403, "You have view-only access, so I can't delete this."],
    [500, "I couldn't delete that listing. Want to try again?"],
  ])("says so in fixed words when deleting fails with %s, and stays", async (status, message) => {
    const server = startListingsServer();
    await show(<ListingDetailScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: LISTING_MESSAGES.delete }));
    server.failWrites.push({ match: "/listings/l1", status });
    await pressAlertButton(alertSpy, LISTING_MESSAGES.delete, act);
    await screen.findByText(message);
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("locks the buttons while the delete is on its way", async () => {
    const server = startListingsServer();
    await show(<ListingDetailScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: LISTING_MESSAGES.delete }));
    holdWrites();
    await pressAlertButton(alertSpy, LISTING_MESSAGES.delete, act);
    expect(screen.getByRole("button", { name: LISTING_MESSAGES.edit }).props.accessibilityState.disabled).toBe(true);
    expect(writesTo(server, "delete")).toHaveLength(0);
  });
});

describe("adding a listing", () => {
  async function fillRequired(): Promise<void> {
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "  Sunny loft ");
    await fireEvent.press(await screen.findByLabelText("Property *, Choose a property"));
    await fireEvent.press(await screen.findByRole("radio", { name: "Elm House" }));
    await fireEvent.changeText(screen.getByLabelText("Monthly rate (USD), required"), "1500");
  }

  it("shows a viewer that they can only look", async () => {
    startListingsServer({ role: "viewer" });
    await show(<ListingCreateScreen />);
    await screen.findByText(FORM_MESSAGES.viewOnlyHeading);
  });

  it("asks for what's missing, and sends nothing", async () => {
    const server = startListingsServer();
    await show(<ListingCreateScreen />);
    await screen.findByLabelText("Title, required");
    await fireEvent.press(button(FORM.add));
    expect(screen.getByText("Add a title.")).toBeTruthy();
    expect(screen.getByText("Pick a property.")).toBeTruthy();
    expect(screen.getByText("Add the monthly rate.")).toBeTruthy();
    expect(writesTo(server, "post")).toHaveLength(0);
  });

  it("drops what can't be part of a rate or a day count as it's typed", async () => {
    startListingsServer();
    await show(<ListingCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Monthly rate (USD), required"), "12a00.555");
    expect(screen.getByLabelText("Monthly rate (USD), required").props.value).toBe("1200.55");
    await fireEvent.changeText(screen.getByLabelText(FORM.minStay), "3x0");
    expect(screen.getByLabelText(FORM.minStay).props.value).toBe("30");
  });

  it.each([
    ["1200,50", "1200.50"],
    ["1.2.3", ""],
    ["12.345", "12.34"],
  ])("reads %s as a rate of %s", async (typed, shown) => {
    startListingsServer();
    await show(<ListingCreateScreen />);
    const field = await screen.findByLabelText("Monthly rate (USD), required");
    await fireEvent.changeText(field, typed);
    expect(screen.getByLabelText("Monthly rate (USD), required").props.value).toBe(shown);
  });

  it("rejects a zero rate and a minimum stay longer than the maximum", async () => {
    const server = startListingsServer();
    await show(<ListingCreateScreen />);
    await fillRequired();
    await fireEvent.changeText(screen.getByLabelText("Monthly rate (USD), required"), "0");
    await fireEvent.changeText(screen.getByLabelText(FORM.minStay), "60");
    await fireEvent.changeText(screen.getByLabelText(FORM.maxStay), "30");
    await fireEvent.press(button(FORM.add));
    expect(screen.getByText("Monthly rate must be greater than 0.")).toBeTruthy();
    expect(screen.getByText("The minimum stay can't be longer than the maximum.")).toBeTruthy();
    expect(writesTo(server, "post")).toHaveLength(0);
  });

  it("adds a listing, tells the person, and goes back", async () => {
    const server = startListingsServer({ listings: [] });
    await show(<ListingCreateScreen />);
    await fillRequired();
    await fireEvent.changeText(screen.getByLabelText(FORM.amenities), "wifi, , smart lock");
    await fireEvent(screen.getByLabelText(FORM.pets), "valueChange", true);
    await fireEvent.changeText(screen.getByLabelText(FORM.petDisclosure), "A friendly dog");
    await fireEvent.press(button(FORM.add));
    await screen.findByText(FORM.added);
    expect(writesTo(server, "post")).toEqual([
      {
        url: "/listings",
        body: {
          property_id: "p1",
          title: "Sunny loft",
          description: null,
          monthly_rate: "1500",
          weekly_rate: null,
          nightly_rate: null,
          min_stay_days: null,
          max_stay_days: null,
          room_type: "private_room",
          private_bath: false,
          parking_assigned: false,
          furnished: true,
          status: "draft",
          amenities: ["wifi", "smart lock"],
          pets_on_premises: true,
          large_dog_disclosure: "A friendly dog",
        },
      },
    ]);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });

  it("says the property is gone, not the listing, when adding finds the property deleted", async () => {
    const server = startListingsServer({ listings: [] });
    await show(<ListingCreateScreen />);
    await fillRequired();
    server.failWrites.push({ match: "/listings", status: 404 });
    await fireEvent.press(button(FORM.add));
    await screen.findByText(FORM.propertyGone);
  });

  it("shows loading on the button at once, locks the fields, and sends once", async () => {
    const server = startListingsServer({ listings: [] });
    await show(<ListingCreateScreen />);
    await fillRequired();
    holdWrites();
    await fireEvent.press(button(FORM.add));
    await fireEvent.press(button(FORM.adding));
    expect(screen.getByLabelText("Title, required").props.editable).toBe(false);
    expect(writesTo(server, "post")).toHaveLength(0);
  });

  it.each([
    [403, "You have view-only access, so I can't save this."],
    [422, "Something in there isn't right. Check the fields and try again."],
    [500, "I'm not sure that saved. Check your listings before trying again, so you don't end up with two."],
  ])("keeps the form and says so in fixed words when saving fails with %s", async (status, message) => {
    const server = startListingsServer({ listings: [] });
    server.failWrites.push({ match: "/listings", status });
    await show(<ListingCreateScreen />);
    await fillRequired();
    await fireEvent.press(button(FORM.add));
    await screen.findByText(message);
    expect(screen.getByLabelText("Title, required").props.value).toBe("  Sunny loft ");
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("asks before discarding what was typed, and not when nothing was", async () => {
    startListingsServer();
    await show(<ListingCreateScreen />);
    await screen.findByLabelText("Title, required");
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(screen.getByLabelText("Title, required"), "Sunny");
    expect(mockPreventRemove.active).toBe(true);
    const leave = jest.fn();
    await act(async () => mockPreventRemove.callback?.({ repeat: leave }));
    expect(alertSpy.mock.calls.at(-1)?.slice(0, 2)).toEqual([FORM_MESSAGES.discardTitle, FORM_MESSAGES.discardBody]);
    await pressAlertButton(alertSpy, FORM_MESSAGES.discard, act);
    expect(leave).toHaveBeenCalled();
  });
});

describe("changing a listing", () => {
  it("starts from what is saved", async () => {
    startListingsServer({ listings: [aListing({ weekly_rate: "300.00", amenities: ["wifi", "washer"] })] });
    await show(<ListingEditScreen id="l1" />);
    expect((await screen.findByLabelText("Title, required")).props.value).toBe("Garden room");
    expect(screen.getByLabelText("Monthly rate (USD), required").props.value).toBe("1200.00");
    expect(screen.getByLabelText(FORM.weeklyRate).props.value).toBe("300.00");
    expect(screen.getByLabelText(FORM.amenities).props.value).toBe("wifi, washer");
    expect(screen.getByRole("button", { name: "Room type, Private Room" })).toBeTruthy();
  });

  it("sends only what changed, and clears a field that was emptied", async () => {
    const server = startListingsServer({ listings: [aListing({ weekly_rate: "300.00" })] });
    await show(<ListingEditScreen id="l1" />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "Garden suite");
    await fireEvent.changeText(screen.getByLabelText(FORM.weeklyRate), "");
    await fireEvent.press(button(FORM.save));
    await screen.findByText(FORM.saved);
    expect(writesTo(server, "put")).toEqual([{ url: "/listings/l1", body: { title: "Garden suite", weekly_rate: null } }]);
  });

  it("doesn't send fields it wasn't asked to change when the listing is refetched mid-edit", async () => {
    const server = startListingsServer({ listings: [aListing({ weekly_rate: "300.00" })] });
    await show(<ListingEditScreen id="l1" />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "Garden suite");
    // Another device changes the weekly rate while this form is open.
    server.listings[0].weekly_rate = "350.00";
    await act(async () => {
      store.dispatch(listingsApi.util.invalidateTags([{ type: "Listing", id: "l1" }]));
    });
    await waitFor(() => expect(server.requests.filter((r) => r.method === "get" && r.url === "/listings/l1").length).toBeGreaterThan(1));
    await fireEvent.press(button(FORM.save));
    await screen.findByText(FORM.saved);
    expect(writesTo(server, "put")).toEqual([{ url: "/listings/l1", body: { title: "Garden suite" } }]);
    expect(server.listings[0].weekly_rate).toBe("350.00");
  });

  it("treats 1200 and 1200.00 as the same rate", async () => {
    const server = startListingsServer();
    await show(<ListingEditScreen id="l1" />);
    await fireEvent.changeText(await screen.findByLabelText("Monthly rate (USD), required"), "1200");
    await fireEvent.press(button(FORM.save));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(writesTo(server, "put")).toHaveLength(0);
  });

  it("goes back without sending anything when nothing changed", async () => {
    const server = startListingsServer();
    await show(<ListingEditScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: FORM.save }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(writesTo(server, "put")).toHaveLength(0);
  });

  it("says when the listing was deleted meanwhile, and keeps what was typed", async () => {
    const server = startListingsServer();
    await show(<ListingEditScreen id="l1" />);
    await fireEvent.changeText(await screen.findByLabelText("Title, required"), "Garden suite");
    server.listings = [];
    await fireEvent.press(button(FORM.save));
    await screen.findByText("I can't find that listing anymore. It may have been deleted.");
    expect(screen.getByLabelText("Title, required").props.value).toBe("Garden suite");
  });

  it("can't be reached by a viewer", async () => {
    startListingsServer({ role: "viewer" });
    await show(<ListingEditScreen id="l1" />);
    await screen.findByText(FORM_MESSAGES.viewOnlyHeading);
  });

  it("says when the listing isn't there, and offers a way back", async () => {
    startListingsServer({ listings: [] });
    await show(<ListingEditScreen id="l1" />);
    await screen.findByText(LISTING_MESSAGES.cantFind);
    await fireEvent.press(button(LISTING_MESSAGES.back));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("offers a retry when it couldn't load, and recovers", async () => {
    const server = startListingsServer();
    server.failReadsFor = ["/listings/l1"];
    await show(<ListingEditScreen id="l1" />);
    await screen.findByText(LISTING_MESSAGES.couldntLoadOne);
    server.failReadsFor = [];
    await fireEvent.press(button(LISTING_MESSAGES.tryAgain));
    await screen.findByLabelText("Title, required");
  });
});
