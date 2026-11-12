import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { Linking } from "react-native";
import { FORM_MESSAGES } from "../src/constants/forms";
import { LISTING_CHANNEL_MESSAGES as MESSAGES, removeChannelTitle } from "../src/constants/listingChannels";
import ChannelListingFormGate from "../src/features/listings/ChannelListingFormGate";
import ListingChannelsScreen from "../src/features/listings/ListingChannelsScreen";
import { holdWrites } from "../test-support/holdWrites";
import { aChannel, aChannelListing, aListing, startListingsServer, writesTo } from "../test-support/listingsServer";
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
const furnished = aChannel("c1", "Furnished");
const airbnb = aChannel("c2", "Airbnb");
const icalOnly = aChannel("c3", "Direct", { supports_ical_import: false });
const url = () => screen.getByLabelText(`${MESSAGES.externalUrl}, required`);
const channelsServer = (listingChannels = [aChannelListing("cl1", furnished)], role = "owner") =>
  startListingsServer({ role, listings: [aListing()], channels: [furnished, airbnb, icalOnly], channelListings: listingChannels });

describe("a listing's channels", () => {
  it("offers to add the first one when there are none", async () => {
    channelsServer([]);
    await show(<ListingChannelsScreen id="l1" />);
    await screen.findByText(MESSAGES.noneHeading);
    await fireEvent.press(button(MESSAGES.add));
    expect(mockRouter.push).toHaveBeenCalledWith("/listings/l1/channels/new");
  });

  it("tells a viewer with none that someone else adds them", async () => {
    channelsServer([], "viewer");
    await show(<ListingChannelsScreen id="l1" />);
    await screen.findByText(MESSAGES.noneViewOnlyBody);
  });

  it("tells a failed load from an empty one, and recovers on Try again", async () => {
    const server = channelsServer();
    server.failReadsFor = ["/listings/l1/channels"];
    await show(<ListingChannelsScreen id="l1" />);
    await screen.findByText(MESSAGES.couldntLoad);
    server.failReadsFor = [];
    await fireEvent.press(button(MESSAGES.tryAgain));
    await screen.findByText("Furnished");
  });

  it("shows the sync state, the missing-feed note, and opens the channel", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    channelsServer([
      aChannelListing("cl1", furnished),
      aChannelListing("cl2", airbnb, { ical_import_url: "https://air.example/cal.ics", last_imported_at: new Date().toISOString() }),
      aChannelListing("cl3", icalOnly, { ical_import_url: "https://d.example/cal.ics", last_import_error: "bad feed" }),
    ]);
    await show(<ListingChannelsScreen id="l1" />);
    await screen.findByText(MESSAGES.notSynced);
    expect(screen.getByText(MESSAGES.noInbound)).toBeTruthy();
    expect(screen.getByText("Synced just now")).toBeTruthy();
    expect(screen.getByText(MESSAGES.syncFailed)).toBeTruthy();
    await fireEvent.press(button("Open Furnished listing"));
    expect(openURL).toHaveBeenCalledWith("https://furnished.example/room");
  });

  it("copies the outbound iCal address, for a viewer too", async () => {
    channelsServer([aChannelListing("cl1", furnished)], "viewer");
    await show(<ListingChannelsScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Copy iCal URL for Furnished" }));
    await screen.findByText(MESSAGES.icalCopied);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("https://mbk.example/ical/cl1.ics");
    expect(screen.queryByRole("button", { name: "Edit Furnished" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Furnished" })).toBeNull();
  });

  it("opens the edit screen for a writer", async () => {
    channelsServer();
    await show(<ListingChannelsScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Edit Furnished" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/listings/l1/channels/cl1");
  });

  it("asks before removing, then removes and says so", async () => {
    const server = channelsServer();
    await show(<ListingChannelsScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Remove Furnished" }));
    expect(alertSpy.mock.calls.at(-1)?.slice(0, 2)).toEqual([removeChannelTitle("Furnished"), MESSAGES.removeBody]);
    expect(writesTo(server, "delete")).toHaveLength(0);
    await pressAlertButton(alertSpy, MESSAGES.remove, act);
    await screen.findByText(MESSAGES.removed);
    expect(writesTo(server, "delete")).toEqual([{ url: "/channel-listings/cl1", body: {} }]);
  });

  it("keeps the channel and says so when removing fails", async () => {
    const server = channelsServer();
    await show(<ListingChannelsScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Remove Furnished" }));
    server.failWrites.push({ match: "/channel-listings", status: 500 });
    await pressAlertButton(alertSpy, MESSAGES.remove, act);
    await screen.findByText("I couldn't delete that channel. Want to try again?");
    expect(screen.getByText("Furnished")).toBeTruthy();
  });
});

describe("adding a channel", () => {
  it("shows a viewer that they can only look", async () => {
    channelsServer([], "viewer");
    await show(<ChannelListingFormGate id="l1" />);
    await screen.findByText(FORM_MESSAGES.viewOnlyHeading);
  });

  it("offers a retry when the channel list can't load, and recovers", async () => {
    const server = channelsServer([]);
    server.failReadsFor = ["/channels"];
    await show(<ChannelListingFormGate id="l1" />);
    await screen.findByText(MESSAGES.channelsFailed);
    server.failReadsFor = [];
    await fireEvent.press(button(MESSAGES.tryAgain));
    await screen.findByLabelText(`${MESSAGES.externalUrl}, required`);
  });

  it("requires a web address for the listing", async () => {
    const server = channelsServer([]);
    await show(<ChannelListingFormGate id="l1" />);
    await screen.findByLabelText(`${MESSAGES.externalUrl}, required`);
    await fireEvent.press(button(MESSAGES.addSubmit));
    expect(screen.getByText(/Channel URL is required/)).toBeTruthy();
    await fireEvent.changeText(url(), "nope");
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.icalImportUrl), "also nope");
    await fireEvent.press(button(MESSAGES.addSubmit));
    expect(screen.getByText("Enter a web address that starts with http:// or https://.")).toBeTruthy();
    expect(screen.getByText(/Enter the calendar address as a web link/)).toBeTruthy();
    expect(writesTo(server, "post")).toHaveLength(0);
  });

  it("adds the channel, trimming and sending empty optional fields as nothing", async () => {
    const server = channelsServer([]);
    await show(<ChannelListingFormGate id="l1" />);
    await fireEvent.changeText(await screen.findByLabelText(`${MESSAGES.externalUrl}, required`), " https://furnished.example/room ");
    await fireEvent.press(button(MESSAGES.addSubmit));
    await screen.findByText(MESSAGES.added);
    expect(writesTo(server, "post")).toEqual([
      { url: "/listings/l1/channels", body: { channel_id: "c1", external_url: "https://furnished.example/room", external_id: null, ical_import_url: null } },
    ]);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });

  it("only offers channels that aren't linked yet, and hides the feed field for one without a calendar", async () => {
    channelsServer();
    await show(<ChannelListingFormGate id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Channel, Airbnb" }));
    expect(screen.queryByRole("radio", { name: "Furnished" })).toBeNull();
    await fireEvent.press(screen.getByRole("radio", { name: "Direct" }));
    expect(screen.queryByLabelText(MESSAGES.icalImportUrl)).toBeNull();
    expect(screen.getByText(`Direct ${MESSAGES.noCalendarFeed}`)).toBeTruthy();
  });

  it("says when every channel is already linked", async () => {
    channelsServer([aChannelListing("cl1", furnished), aChannelListing("cl2", airbnb), aChannelListing("cl3", icalOnly)]);
    await show(<ChannelListingFormGate id="l1" />);
    await screen.findByText(MESSAGES.noMoreChannels);
  });

  it("locks the form while saving and sends once", async () => {
    const server = channelsServer([]);
    await show(<ChannelListingFormGate id="l1" />);
    await fireEvent.changeText(await screen.findByLabelText(`${MESSAGES.externalUrl}, required`), "https://x.example/r");
    holdWrites();
    await fireEvent.press(button(MESSAGES.addSubmit));
    await fireEvent.press(button(MESSAGES.adding));
    expect(url().props.editable).toBe(false);
    expect(writesTo(server, "post")).toHaveLength(0);
  });

  it.each([
    [409, MESSAGES.conflict],
    [403, "You have view-only access, so I can't save this."],
    [404, "I can't find that channel anymore. It may have been deleted."],
    [500, "I'm not sure that saved. Check your channels before trying again, so you don't end up with two."],
  ])("keeps the form and says so in fixed words when saving fails with %s", async (status, message) => {
    const server = channelsServer([]);
    server.failWrites.push({ match: "/channels", status });
    await show(<ChannelListingFormGate id="l1" />);
    await fireEvent.changeText(await screen.findByLabelText(`${MESSAGES.externalUrl}, required`), "https://x.example/r");
    await fireEvent.press(button(MESSAGES.addSubmit));
    await screen.findByText(message);
    expect(url().props.value).toBe("https://x.example/r");
  });

  it("asks before discarding what was typed", async () => {
    channelsServer([]);
    await show(<ChannelListingFormGate id="l1" />);
    await screen.findByLabelText(`${MESSAGES.externalUrl}, required`);
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(url(), "https://x");
    expect(mockPreventRemove.active).toBe(true);
    await act(async () => mockPreventRemove.callback?.({ repeat: jest.fn() }));
    expect(alertSpy.mock.calls.at(-1)?.slice(0, 2)).toEqual([FORM_MESSAGES.discardTitle, FORM_MESSAGES.discardBody]);
  });
});

describe("changing a channel", () => {
  it("starts from what is saved, with the channel fixed and the outbound address to copy", async () => {
    channelsServer([aChannelListing("cl1", furnished, { external_id: "AB-1" })]);
    await show(<ChannelListingFormGate channelListingId="cl1" id="l1" />);
    expect((await screen.findByLabelText(`${MESSAGES.externalUrl}, required`)).props.value).toBe("https://furnished.example/room");
    expect(screen.getByLabelText(MESSAGES.externalId).props.value).toBe("AB-1");
    expect(button("Channel, Furnished").props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button(`Copy ${MESSAGES.outboundUrl}`));
    await screen.findByText(MESSAGES.icalCopied);
  });

  it("saves the change and goes back", async () => {
    const server = channelsServer();
    await show(<ChannelListingFormGate channelListingId="cl1" id="l1" />);
    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.icalImportUrl), "https://f.example/cal.ics");
    await fireEvent.press(button(MESSAGES.save));
    await screen.findByText(MESSAGES.saved);
    expect(writesTo(server, "patch")).toEqual([
      { url: "/channel-listings/cl1", body: { external_url: "https://furnished.example/room", external_id: null, ical_import_url: "https://f.example/cal.ics" } },
    ]);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });

  it("says when the channel was removed meanwhile", async () => {
    channelsServer([]);
    await show(<ChannelListingFormGate channelListingId="cl1" id="l1" />);
    await screen.findByText(MESSAGES.alreadyRemoved);
  });
});
