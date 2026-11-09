import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";
import { FORM_MESSAGES } from "../src/constants/forms";
import { LISTING_LINK_MESSAGES as MESSAGES, removeLinkTitle } from "../src/constants/listingLinks";
import ListingLinkCreateScreen from "../src/features/listings/ListingLinkCreateScreen";
import ListingLinkEditScreen from "../src/features/listings/ListingLinkEditScreen";
import ListingLinksScreen from "../src/features/listings/ListingLinksScreen";
import { holdWrites } from "../test-support/holdWrites";
import { aLink, aListing, startListingsServer, writesTo } from "../test-support/listingsServer";
import { mockPreventRemove, mockRouter, pressAlertButton, restoreApi, show, signInToWorkspace } from "../test-support/listingsHarness";

jest.mock("expo-router", () => jest.requireActual("../test-support/listingsHarness").expoRouterMock());
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  alertSpy = signInToWorkspace();
});
afterEach(restoreApi);

const button = (name: string) => screen.getByRole("button", { name });
const linked = (...links: ReturnType<typeof aLink>[]) => startListingsServer({ listings: [aListing({ external_ids: links })] });

describe("a listing's links to other sites", () => {
  it("offers to add the first one when there are none", async () => {
    startListingsServer();
    await show(<ListingLinksScreen id="l1" />);
    await screen.findByText(MESSAGES.noneHeading);
    await fireEvent.press(button(MESSAGES.add));
    expect(mockRouter.push).toHaveBeenCalledWith("/listings/l1/links/new");
  });

  it("tells a viewer with none that someone else adds them", async () => {
    startListingsServer({ role: "viewer" });
    await show(<ListingLinksScreen id="l1" />);
    await screen.findByText(MESSAGES.noneViewOnlyBody);
    expect(screen.queryByRole("button", { name: MESSAGES.add })).toBeNull();
  });

  it("shows each link, opens it, and offers editing to a writer", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    linked(aLink("k1"), aLink("k2", { source: "Airbnb", external_id: "777", external_url: null }));
    await show(<ListingLinksScreen id="l1" />);
    await screen.findByText("ID: 12345");
    expect(screen.getByText("ID: 777")).toBeTruthy();
    await fireEvent.press(button("Open link, Furnished Finder"));
    expect(openURL).toHaveBeenCalledWith("https://ff.example/12345");
    await fireEvent.press(button("Edit Airbnb link"));
    expect(mockRouter.push).toHaveBeenCalledWith("/listings/l1/links/k2");
  });

  it("gives a viewer the links and no Edit or Remove", async () => {
    startListingsServer({ role: "viewer", listings: [aListing({ external_ids: [aLink("k1")] })] });
    await show(<ListingLinksScreen id="l1" />);
    await screen.findByText("ID: 12345");
    expect(screen.getByRole("button", { name: /^Open link/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
  });

  it("asks before removing, and says what happens", async () => {
    const server = linked(aLink("k1"));
    await show(<ListingLinksScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Remove Furnished Finder link" }));
    expect(alertSpy.mock.calls.at(-1)?.slice(0, 2)).toEqual([removeLinkTitle("Furnished Finder"), MESSAGES.removeBody]);
    expect(writesTo(server, "delete")).toHaveLength(0);
  });

  it("removes after confirming, and says so", async () => {
    const server = linked(aLink("k1"), aLink("k2", { source: "TNH", external_id: "555" }));
    await show(<ListingLinksScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Remove Furnished Finder link" }));
    await pressAlertButton(alertSpy, MESSAGES.remove, act);
    await screen.findByText(MESSAGES.removed);
    expect(writesTo(server, "delete")).toEqual([{ url: "/listings/l1/external-ids/k1", body: {} }]);
    await waitFor(() => expect(screen.queryByText("ID: 12345")).toBeNull());
  });

  it("keeps the link and says so in fixed words when removing fails", async () => {
    const server = linked(aLink("k1"));
    await show(<ListingLinksScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Remove Furnished Finder link" }));
    server.failWrites.push({ match: "/external-ids", status: 500 });
    await pressAlertButton(alertSpy, MESSAGES.remove, act);
    await screen.findByText("I couldn't delete that link. Want to try again?");
    expect(screen.getByText("ID: 12345")).toBeTruthy();
  });
});

describe("adding a link", () => {
  const idField = () => screen.getByLabelText(MESSAGES.externalId);

  it("shows a viewer that they can only look", async () => {
    startListingsServer({ role: "viewer" });
    await show(<ListingLinkCreateScreen id="l1" />);
    await screen.findByText(FORM_MESSAGES.viewOnlyHeading);
  });

  it("needs an ID or a link, and a link must be a web address", async () => {
    const server = startListingsServer();
    await show(<ListingLinkCreateScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.addSubmit }));
    expect(screen.getByText(/at least an external ID or a URL/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.externalUrl), "ff.example/12");
    await fireEvent.press(button(MESSAGES.addSubmit));
    expect(screen.getByText("Enter a web address that starts with http:// or https://.")).toBeTruthy();
    expect(writesTo(server, "post")).toHaveLength(0);
  });

  it("adds a link, picking the site, and goes back", async () => {
    const server = startListingsServer();
    await show(<ListingLinkCreateScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Site, Furnished Finder" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Airbnb" }));
    await fireEvent.changeText(idField(), " 9876 ");
    await fireEvent.press(button(MESSAGES.addSubmit));
    await screen.findByText(MESSAGES.added);
    expect(writesTo(server, "post")).toEqual([{ url: "/listings/l1/external-ids", body: { source: "Airbnb", external_id: "9876", external_url: null } }]);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });

  it("only offers the sites that aren't linked yet", async () => {
    linked(aLink("k1"), aLink("k2", { source: "TNH" }));
    await show(<ListingLinkCreateScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Site, Airbnb" }));
    expect(screen.queryByRole("radio", { name: "Furnished Finder" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Direct" })).toBeTruthy();
  });

  it("says when every site is already linked", async () => {
    linked(aLink("k1"), aLink("k2", { source: "TNH" }), aLink("k3", { source: "Airbnb" }), aLink("k4", { source: "direct" }));
    await show(<ListingLinkCreateScreen id="l1" />);
    await screen.findByText(MESSAGES.allLinked);
  });

  it("locks the form while saving and sends once", async () => {
    const server = startListingsServer();
    await show(<ListingLinkCreateScreen id="l1" />);
    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.externalId), "1");
    holdWrites();
    await fireEvent.press(button(MESSAGES.addSubmit));
    await fireEvent.press(button(MESSAGES.adding));
    expect(idField().props.editable).toBe(false);
    expect(writesTo(server, "post")).toHaveLength(0);
  });

  it.each([
    [409, MESSAGES.conflict],
    [403, "You have view-only access, so I can't save this."],
    [500, "I'm not sure that saved. Check your links before trying again, so you don't end up with two."],
  ])("keeps the form and says so in fixed words when saving fails with %s", async (status, message) => {
    const server = startListingsServer();
    server.failWrites.push({ match: "/external-ids", status });
    await show(<ListingLinkCreateScreen id="l1" />);
    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.externalId), "1");
    await fireEvent.press(button(MESSAGES.addSubmit));
    await screen.findByText(message);
    expect(idField().props.value).toBe("1");
  });

  it("asks before discarding what was typed", async () => {
    startListingsServer();
    await show(<ListingLinkCreateScreen id="l1" />);
    await screen.findByLabelText(MESSAGES.externalId);
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(idField(), "1");
    expect(mockPreventRemove.active).toBe(true);
    await act(async () => mockPreventRemove.callback?.({ repeat: jest.fn() }));
    expect(alertSpy.mock.calls.at(-1)?.slice(0, 2)).toEqual([FORM_MESSAGES.discardTitle, FORM_MESSAGES.discardBody]);
  });
});

describe("changing a link", () => {
  it("starts from what is saved, with the site fixed", async () => {
    linked(aLink("k1"));
    await show(<ListingLinkEditScreen id="l1" linkId="k1" />);
    expect((await screen.findByLabelText(MESSAGES.externalId)).props.value).toBe("12345");
    expect(screen.getByLabelText(MESSAGES.externalUrl).props.value).toBe("https://ff.example/12345");
    expect(button("Site, Furnished Finder").props.accessibilityState.disabled).toBe(true);
  });

  it("saves the change, clearing a field that was emptied", async () => {
    const server = linked(aLink("k1"));
    await show(<ListingLinkEditScreen id="l1" linkId="k1" />);
    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.externalId), "");
    await fireEvent.press(button(MESSAGES.save));
    await screen.findByText(MESSAGES.saved);
    expect(writesTo(server, "patch")).toEqual([{ url: "/listings/l1/external-ids/k1", body: { external_id: null, external_url: "https://ff.example/12345" } }]);
  });

  it("goes back without sending anything when nothing changed", async () => {
    const server = linked(aLink("k1"));
    await show(<ListingLinkEditScreen id="l1" linkId="k1" />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.save }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(writesTo(server, "patch")).toHaveLength(0);
  });

  it("says when the link was removed meanwhile", async () => {
    linked();
    await show(<ListingLinkEditScreen id="l1" linkId="k1" />);
    await screen.findByText(MESSAGES.alreadyRemoved);
  });
});
