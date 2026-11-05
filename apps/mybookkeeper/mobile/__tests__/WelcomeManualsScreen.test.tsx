import type { WelcomeManualResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-response";
import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";
import type { WelcomeManualSummary } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-summary";
import { welcomeManualsApi } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import type { ReactElement } from "react";
import { Linking, Share } from "react-native";
import { Provider } from "react-redux";
import { WEB_BASE_URL } from "../src/constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { WELCOME_MANUAL_MESSAGES } from "../src/constants/welcomeManuals";
import { manualPropertyName, manualShareMessage, photosLine, placeLine } from "../src/features/welcomeManuals/welcomeManualDisplay";
import WelcomeManualDetailScreen from "../src/features/welcomeManuals/WelcomeManualDetailScreen";
import WelcomeManualsScreen from "../src/features/welcomeManuals/WelcomeManualsScreen";
import { store } from "../src/lib/store";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack() },
}));

const originalAdapter = api.defaults.adapter;
const PROPERTIES = [{ id: "pr1", name: "Oak Street" }];

function aSummary(overrides: Partial<WelcomeManualSummary> = {}): WelcomeManualSummary {
  return {
    id: "m1",
    title: "Beach House guide",
    property_id: "pr1",
    section_count: 2,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-11-03T12:00:00Z",
    ...overrides,
  };
}

function aSection(overrides: Partial<WelcomeManualSectionResponse> = {}): WelcomeManualSectionResponse {
  return {
    id: "s1",
    manual_id: "m1",
    room_id: null,
    title: "Getting online",
    body: "**Router** is in the closet.",
    display_order: 0,
    fields: [
      { id: "f1", section_id: "s1", label: "Wi-Fi network", value: "Lakeview", display_order: 0, created_at: "2026-01-01T12:00:00Z" },
      { id: "f2", section_id: "s1", label: "Spare key", value: null, display_order: 1, created_at: "2026-01-01T12:00:00Z" },
    ],
    images: [],
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
    ...overrides,
  };
}

function aManual(overrides: Partial<WelcomeManualResponse> = {}): WelcomeManualResponse {
  return {
    id: "m1",
    organization_id: "o",
    user_id: "u",
    property_id: "pr1",
    title: "Beach House guide",
    intro_text: "Welcome to the **house**.",
    rooms: [],
    sections: [aSection()],
    places: [],
    share_token: "tok123",
    share_pin: "4829",
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-11-03T12:00:00Z",
    ...overrides,
  };
}

function startServer(list: unknown, detail: unknown = aManual()) {
  const server = { list, detail };
  const adapter: AxiosAdapter = async (config) => {
    const answer = config.url === "/properties" ? PROPERTIES : config.url === "/welcome-manuals" ? server.list : server.detail;
    if (answer === "hold") return new Promise(() => undefined);
    if (answer === "fail") return Promise.reject({ response: { status: 500, data: {} }, config, isAxiosError: true });
    if (answer === "gone") return Promise.reject({ response: { status: 404, data: {} }, config, isAxiosError: true });
    return { data: answer, status: 200, statusText: "OK", headers: {}, config };
  };
  api.defaults.adapter = adapter;
  return server;
}

function aPage(items: WelcomeManualSummary[], hasMore = false) {
  return { items, total: items.length, has_more: hasMore };
}

async function show(element: ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockPush.mockClear();
  mockBack.mockClear();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("manualPropertyName", () => {
  it("names the property, says when none is tagged, and stays blank until it knows", () => {
    expect(manualPropertyName("pr1", PROPERTIES)).toBe("Oak Street");
    expect(manualPropertyName(null, PROPERTIES)).toBe(WELCOME_MANUAL_MESSAGES.noProperty);
    expect(manualPropertyName("pr1", undefined)).toBeNull();
    expect(manualPropertyName("gone", PROPERTIES)).toBeNull();
  });
});

describe("manualShareMessage", () => {
  it("sends the link and the code together, and only the link when there's no code", () => {
    expect(manualShareMessage("tok123", "4829")).toBe(`Here's your guide: ${WEB_BASE_URL}/guide/tok123\nAccess code: 4829`);
    expect(manualShareMessage("tok123", null)).toBe(`Here's your guide: ${WEB_BASE_URL}/guide/tok123`);
  });
});

describe("placeLine", () => {
  it("leaves out a missing price", () => {
    expect(placeLine({ cuisine: "Tacos", price_tier: "$$" })).toBe("Tacos · $$");
    expect(placeLine({ cuisine: "Tacos", price_tier: null })).toBe("Tacos");
  });
});

describe("photosLine", () => {
  it("counts, and says nothing when there are none", () => {
    expect(photosLine(0)).toBeNull();
    expect(photosLine(1)).toBe("1 photo on the website");
    expect(photosLine(3)).toBe("3 photos on the website");
  });
});

describe("WelcomeManualsScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer("hold");
    await show(<WelcomeManualsScreen />);
    expect(await screen.findByTestId("welcome-manuals-skeleton")).toBeTruthy();
  });

  it("lists a manual with its property, and opens it", async () => {
    startServer(aPage([aSummary()]));
    await show(<WelcomeManualsScreen />);
    await screen.findByText("Beach House guide");
    await screen.findByText("Oak Street");
    expect(screen.getByText("2 sections · Updated Nov 3, 2026")).toBeTruthy();
    expect(screen.queryByText(WELCOME_MANUAL_MESSAGES.noSectionsChip)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Beach House guide, Oak Street, 2 sections · Updated Nov 3, 2026" }));
    expect(mockPush).toHaveBeenCalledWith("/welcome-manuals/m1");
  });

  it("flags a manual with nothing in it", async () => {
    startServer(aPage([aSummary({ section_count: 0, property_id: null })]));
    await show(<WelcomeManualsScreen />);
    await screen.findByText(WELCOME_MANUAL_MESSAGES.noSectionsChip);
    expect(screen.getByText(WELCOME_MANUAL_MESSAGES.noProperty)).toBeTruthy();
  });

  it("says when there are more than it shows", async () => {
    startServer(aPage([aSummary()], true));
    await show(<WelcomeManualsScreen />);
    await screen.findByText(WELCOME_MANUAL_MESSAGES.moreOnWebsite);
  });

  it("points to the website when there are none", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    startServer(aPage([]));
    await show(<WelcomeManualsScreen />);
    await screen.findByText(WELCOME_MANUAL_MESSAGES.noneHeading);
    await fireEvent.press(screen.getByRole("button", { name: WELCOME_MANUAL_MESSAGES.openWebsite }));
    expect(openURL).toHaveBeenCalledWith(`${WEB_BASE_URL}/welcome-manuals`);
  });

  it("keeps saying there are none during a reload", async () => {
    const server = startServer(aPage([]));
    await show(<WelcomeManualsScreen />);
    await screen.findByText(WELCOME_MANUAL_MESSAGES.noneHeading);
    server.list = "hold";
    await act(async () => {
      void screen.getByTestId("welcome-manuals-list").props.refreshControl.props.onRefresh();
    });
    expect(screen.getByText(WELCOME_MANUAL_MESSAGES.noneHeading)).toBeTruthy();
    expect(screen.queryByTestId("welcome-manuals-skeleton")).toBeNull();
  });

  it("offers a retry when the first load fails, and recovers", async () => {
    const server = startServer("fail");
    await show(<WelcomeManualsScreen />);
    await screen.findByText(WELCOME_MANUAL_MESSAGES.couldntLoadList);
    expect(screen.queryByText(WELCOME_MANUAL_MESSAGES.noneHeading)).toBeNull();
    server.list = aPage([aSummary()]);
    await fireEvent.press(screen.getByRole("button", { name: WELCOME_MANUAL_MESSAGES.tryAgain }));
    await screen.findByText("Beach House guide");
  });

  it("keeps what it had and says so when a pull to refresh fails", async () => {
    const server = startServer(aPage([aSummary()]));
    await show(<WelcomeManualsScreen />);
    await screen.findByText("Beach House guide");
    server.list = "fail";
    await act(async () => {
      await screen.getByTestId("welcome-manuals-list").props.refreshControl.props.onRefresh();
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Beach House guide")).toBeTruthy();
  });
});

describe("WelcomeManualDetailScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer(aPage([]), "hold");
    await show(<WelcomeManualDetailScreen id="m1" />);
    expect(await screen.findByTestId("welcome-manual-detail-skeleton")).toBeTruthy();
  });

  it("shows the manual as plain text, leaving out fields with no value", async () => {
    startServer(aPage([]));
    await show(<WelcomeManualDetailScreen id="m1" />);
    await screen.findByText("Welcome to the house.");
    await screen.findByText("Oak Street");
    expect(screen.getByText("Getting online")).toBeTruthy();
    expect(screen.getByText("Wi-Fi network")).toBeTruthy();
    expect(screen.getByText("Lakeview").props.selectable).toBe(true);
    expect(screen.getByText("Router is in the closet.")).toBeTruthy();
    expect(screen.queryByText("Spare key")).toBeNull();
  });

  it("names a section's room and counts its photos", async () => {
    const image = { id: "i1", section_id: "s1", storage_key: "k", caption: null, display_order: 0, created_at: "2026-01-01T12:00:00Z" };
    startServer(aPage([]), aManual({
      rooms: [{ id: "r1", manual_id: "m1", name: "Blue Room", display_order: 0, created_at: "2026-01-01T12:00:00Z", updated_at: "2026-01-01T12:00:00Z" }],
      sections: [aSection({ room_id: "r1", images: [image, { ...image, id: "i2" }] })],
    }));
    await show(<WelcomeManualDetailScreen id="m1" />);
    await screen.findByText("Blue Room");
    expect(screen.getByText("2 photos on the website")).toBeTruthy();
  });

  it("keeps the access code hidden until asked, and shares the link with it", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction", activityType: undefined });
    startServer(aPage([]));
    await show(<WelcomeManualDetailScreen id="m1" />);
    await screen.findByText("••••");
    expect(screen.queryByText("4829")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show the full access code" }));
    expect(screen.getByText("4829")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: WELCOME_MANUAL_MESSAGES.share }));
    expect(share).toHaveBeenCalledWith({ message: `Here's your guide: ${WEB_BASE_URL}/guide/tok123\nAccess code: 4829` });
  });

  it("says so when sharing can't open", async () => {
    jest.spyOn(Share, "share").mockRejectedValue(new Error("no"));
    startServer(aPage([]));
    await show(<WelcomeManualDetailScreen id="m1" />);
    await fireEvent.press(await screen.findByRole("button", { name: WELCOME_MANUAL_MESSAGES.share }));
    await screen.findByText(WELCOME_MANUAL_MESSAGES.shareFailed);
  });

  it("offers just the link when there's no code", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction", activityType: undefined });
    startServer(aPage([]), aManual({ share_pin: null }));
    await show(<WelcomeManualDetailScreen id="m1" />);
    await fireEvent.press(await screen.findByRole("button", { name: WELCOME_MANUAL_MESSAGES.shareLinkOnly }));
    expect(share).toHaveBeenCalledWith({ message: `Here's your guide: ${WEB_BASE_URL}/guide/tok123` });
  });

  it("explains a manual that has no share link yet", async () => {
    startServer(aPage([]), aManual({ share_token: null, share_pin: null, sections: [] }));
    await show(<WelcomeManualDetailScreen id="m1" />);
    await screen.findByText(WELCOME_MANUAL_MESSAGES.noShareLink);
    expect(screen.getByText(WELCOME_MANUAL_MESSAGES.noSections)).toBeTruthy();
    expect(screen.queryByRole("button", { name: WELCOME_MANUAL_MESSAGES.share })).toBeNull();
  });

  it("lists places, and opens a map only when there's one to open", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const place = { id: "p1", manual_id: "m1", name: "Taco Spot", cuisine: "Tacos", price_tier: "$" as const, note: "Cash only", map_url: "https://maps.example/taco", display_order: 0, created_at: "2026-01-01T12:00:00Z" };
    startServer(aPage([]), aManual({ places: [place, { ...place, id: "p2", name: "Noodle Bar", note: null, map_url: null }] }));
    await show(<WelcomeManualDetailScreen id="m1" />);
    await screen.findByText("Taco Spot");
    expect(screen.getByText("Cash only")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Noodle Bar on the map" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Open Taco Spot on the map" }));
    expect(openURL).toHaveBeenCalledWith("https://maps.example/taco");
  });

  it("says when the manual is gone, and offers a way back", async () => {
    startServer(aPage([]), "gone");
    await show(<WelcomeManualDetailScreen id="m1" />);
    await screen.findByText(WELCOME_MANUAL_MESSAGES.cantFind);
    await fireEvent.press(screen.getByRole("button", { name: WELCOME_MANUAL_MESSAGES.back }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("stops offering a manual that was deleted while it was open", async () => {
    const server = startServer(aPage([]));
    await show(<WelcomeManualDetailScreen id="m1" />);
    await screen.findByText("Getting online");
    server.detail = "gone";
    await act(async () => {
      await store.dispatch(welcomeManualsApi.endpoints.getWelcomeManualById.initiate("m1", { forceRefetch: true }));
    });
    await screen.findByText(WELCOME_MANUAL_MESSAGES.cantFind);
    expect(screen.queryByRole("button", { name: WELCOME_MANUAL_MESSAGES.share })).toBeNull();
  });

  it("offers a retry when it couldn't load, and recovers", async () => {
    const server = startServer(aPage([]), "fail");
    await show(<WelcomeManualDetailScreen id="m1" />);
    await screen.findByText(WELCOME_MANUAL_MESSAGES.couldntLoadOne);
    server.detail = aManual();
    await fireEvent.press(screen.getByRole("button", { name: WELCOME_MANUAL_MESSAGES.tryAgain }));
    await screen.findByText("Getting online");
  });

  it("keeps what it had when a reload fails", async () => {
    const server = startServer(aPage([]));
    await show(<WelcomeManualDetailScreen id="m1" />);
    await screen.findByText("Getting online");
    server.detail = "fail";
    await act(async () => {
      await store.dispatch(welcomeManualsApi.endpoints.getWelcomeManualById.initiate("m1", { forceRefetch: true }));
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Getting online")).toBeTruthy();
  });
});
