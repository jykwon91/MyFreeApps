import { LISTING_PAGE_SIZE } from "@mybookkeeper/api-client/constants/listingLabels";
import { listingsApi } from "@mybookkeeper/api-client/store/listingsApi";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import type { ListingSummary } from "@mybookkeeper/api-client/types/listing/listing-summary";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { formatRate } from "@mybookkeeper/api-client/utils/formatRate";
import { Linking, Share } from "react-native";
import { Provider } from "react-redux";
import { WEB_BASE_URL } from "../src/constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { stayLimits } from "../src/features/listings/listingDisplay";
import ListingDetailScreen from "../src/features/listings/ListingDetailScreen";
import ListingsScreen from "../src/features/listings/ListingsScreen";
import { plainFromMarkdown } from "../src/lib/plainFromMarkdown";
import { store } from "../src/lib/store";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack() },
}));

const originalAdapter = api.defaults.adapter;

function aSummary(overrides: Partial<ListingSummary> = {}): ListingSummary {
  return {
    id: "l1",
    title: "Garden room",
    status: "active",
    room_type: "private_room",
    monthly_rate: "1200.00",
    property_id: "p1",
    created_at: "2026-11-01T12:00:00Z",
    slug: "garden-room",
    ...overrides,
  };
}

function aListing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    ...aSummary(),
    organization_id: "w1",
    user_id: "u1",
    description: null,
    weekly_rate: null,
    nightly_rate: null,
    min_stay_days: null,
    max_stay_days: null,
    private_bath: true,
    parking_assigned: false,
    furnished: true,
    amenities: [],
    pets_on_premises: false,
    large_dog_disclosure: null,
    photos: [],
    external_ids: [],
    updated_at: "2026-11-01T12:00:00Z",
    ...overrides,
  };
}

interface Server {
  pages: ListingSummary[][] | "fail";
  listing: ListingResponse | number;
  requests: AxiosRequestConfig[];
  failNextPage: boolean;
}

function startServer(overrides: Partial<Server> = {}): Server {
  const server: Server = { pages: [[]], listing: aListing(), requests: [], failNextPage: false, ...overrides };
  const adapter: AxiosAdapter = async (config) => {
    const respond = (data: unknown, status = 200) => {
      if (status >= 400) return Promise.reject({ response: { status, data }, config, isAxiosError: true });
      return { data, status, statusText: "OK", headers: {}, config };
    };
    if (config.url === "/listings") {
      server.requests.push(config);
      if (server.pages === "fail") return respond({ detail: "down" }, 500);
      const index = (config.params.offset as number) / LISTING_PAGE_SIZE;
      if (index > 0 && server.failNextPage) return respond({ detail: "down" }, 500);
      const wanted = config.params.status as string | undefined;
      const items = (server.pages[index] ?? []).filter((listing) => !wanted || listing.status === wanted);
      return respond({ items, total: items.length, has_more: index + 1 < server.pages.length });
    }
    if (config.url === "/listings/l1") {
      return typeof server.listing === "number" ? respond({ detail: "no" }, server.listing) : respond(server.listing);
    }
    if (config.url === "/properties") return respond([{ id: "p1", name: "Elm House" }]);
    return respond({ detail: "not found" }, 404);
  };
  api.defaults.adapter = adapter;
  return server;
}

function holdListings(): void {
  const answered = api.defaults.adapter as AxiosAdapter;
  api.defaults.adapter = (config) => (config.url?.startsWith("/listings") ? new Promise(() => undefined) : answered(config));
}

async function show(element: React.ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  store.dispatch(baseApi.util.resetApiState());
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("listing display", () => {
  it("words stay limits, whichever are set", () => {
    expect(stayLimits({ min_stay_days: null, max_stay_days: null })).toBeNull();
    expect(stayLimits({ min_stay_days: 30, max_stay_days: null })).toBe("At least 30 days");
    expect(stayLimits({ min_stay_days: null, max_stay_days: 90 })).toBe("At most 90 days");
    expect(stayLimits({ min_stay_days: 30, max_stay_days: 90 })).toBe("At least 30 days, at most 90 days");
    expect(stayLimits({ min_stay_days: 1, max_stay_days: null })).toBe("At least 1 day");
  });

  it("shows cents only when a rate has some", () => {
    expect(formatRate("1200.00")).toBe("$1,200");
    expect(formatRate("49.50")).toBe("$49.50");
  });

  it("takes Markdown's markers off a description and leaves ordinary text alone", () => {
    expect(plainFromMarkdown("# Bright room\n\n**Quiet** and *sunny*\n- Desk\n- [Map](https://x.test)")).toBe("Bright room\n\nQuiet and sunny\n• Desk\n• Map");
    expect(plainFromMarkdown("Rate is 2*3 weeks, snake_case_name stays")).toBe("Rate is 2*3 weeks, snake_case_name stays");
    expect(plainFromMarkdown("Call __init__ or snake__case__name")).toBe("Call init or snake__case__name");
  });

  it("keeps the blank lines around a list", () => {
    expect(plainFromMarkdown("Intro\n\n- Desk\n\n- Bed")).toBe("Intro\n\n• Desk\n\n• Bed");
  });

  it("stays quick on a long description with nothing to close its markers", () => {
    const started = Date.now();
    plainFromMarkdown("[".repeat(50_000) + "\n".repeat(50_000) + " *x".repeat(20_000));
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("ListingsScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer();
    holdListings();
    await show(<ListingsScreen />);
    expect(await screen.findByTestId("listings-skeleton")).toBeTruthy();
  });

  it("shows each listing's title, property, status and rate, and opens it", async () => {
    startServer({ pages: [[aSummary()]] });
    await show(<ListingsScreen />);
    const row = await screen.findByRole("button", { name: "Garden room, Elm House, Active, $1,200 a month" });
    await fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith("/listings/l1");
  });

  it("leaves out a property it can't find, rather than guessing", async () => {
    startServer({ pages: [[aSummary({ property_id: "gone" })]] });
    await show(<ListingsScreen />);
    await screen.findByRole("button", { name: "Garden room, Active, $1,200 a month" });
  });

  it("tells a viewer who can add listings when there are none", async () => {
    startServer();
    await show(<ListingsScreen />);
    await screen.findByText("You don't have any listings yet.");
    expect(screen.getByText("Someone with edit access can add them.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New listing" })).toBeNull();
  });

  it("filters by status, says when nothing matches, and clears", async () => {
    const server = startServer({ pages: [[aSummary()]] });
    await show(<ListingsScreen />);
    await screen.findByText("Garden room");
    await fireEvent.press(screen.getByRole("button", { name: "Status: All" }));
    await fireEvent.press(await screen.findByText("Paused"));
    await screen.findByText("No listings are paused right now.");
    expect(server.requests.at(-1)!.params.status).toBe("paused");
    await fireEvent.press(screen.getByRole("button", { name: "Clear filter" }));
    await screen.findByText("Garden room");
  });

  it("doesn't ask for more when that was the last page", async () => {
    const server = startServer({ pages: [[aSummary()]] });
    await show(<ListingsScreen />);
    await screen.findByText("Garden room");
    await fireEvent(screen.getByTestId("listings-list"), "onEndReached");
    expect(server.requests).toHaveLength(1);
  });

  it("offers a retry when the first load fails, and recovers", async () => {
    const server = startServer({ pages: "fail" });
    await show(<ListingsScreen />);
    await screen.findByText("I couldn't load your listings.");
    server.pages = [[aSummary()]];
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Garden room");
  });

  it("asks for the next page at the end of the list, and offers a retry if that fails", async () => {
    const server = startServer({ pages: [[aSummary()], [aSummary({ id: "l2", title: "Attic" })]], failNextPage: true });
    await show(<ListingsScreen />);
    await screen.findByText("Garden room");
    await fireEvent(screen.getByTestId("listings-list"), "onEndReached");
    await waitFor(() => expect(server.requests.some((request) => request.params.offset === LISTING_PAGE_SIZE)).toBe(true));
    await screen.findByRole("button", { name: /try again/i });
    server.failNextPage = false;
    await fireEvent.press(screen.getByRole("button", { name: /try again/i }));
    await screen.findByText("Attic");
  });
});

describe("ListingDetailScreen", () => {
  it("shows a skeleton first", async () => {
    startServer();
    holdListings();
    await show(<ListingDetailScreen id="l1" />);
    expect(await screen.findByTestId("listing-detail-skeleton")).toBeTruthy();
  });

  it("shows what a host needs to answer a question", async () => {
    startServer({
      listing: aListing({
        weekly_rate: "400.00",
        min_stay_days: 30,
        amenities: ["Wi-Fi", "Washer"],
        description: "**Quiet** room",
      }),
    });
    await show(<ListingDetailScreen id="l1" />);
    await screen.findByText("Garden room");
    expect(screen.getByText("Elm House")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("$1,200")).toBeTruthy();
    expect(screen.getByText("$400")).toBeTruthy();
    expect(screen.queryByText("Nightly")).toBeNull();
    expect(screen.getByText("At least 30 days")).toBeTruthy();
    expect(screen.getByText("Private Room")).toBeTruthy();
    expect(screen.getByText("Not assigned")).toBeTruthy();
    expect(screen.getByText("Wi-Fi, Washer")).toBeTruthy();
    expect(screen.getByText("Quiet room")).toBeTruthy();
    expect(screen.queryByText("Pets on premises")).toBeNull();
  });

  it("shares the inquiry form link and says who can use it", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction", activityType: undefined });
    startServer();
    await show(<ListingDetailScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Share inquiry form link" }));
    expect(share).toHaveBeenCalledWith({ message: `${WEB_BASE_URL}/apply/garden-room` });
    expect(screen.getByText("Anyone with this link can send you an inquiry.")).toBeTruthy();
  });

  it("says so if sharing won't open", async () => {
    jest.spyOn(Share, "share").mockRejectedValue(new Error("no"));
    startServer();
    await show(<ListingDetailScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Share inquiry form link" }));
    await screen.findByText("I couldn't open sharing on this phone.");
  });

  it("has no share button for a listing with no link", async () => {
    startServer({ listing: aListing({ slug: null }) });
    await show(<ListingDetailScreen id="l1" />);
    await screen.findByText("Garden room");
    expect(screen.queryByRole("button", { name: "Share inquiry form link" })).toBeNull();
  });

  it("shows the host's pet note", async () => {
    startServer({ listing: aListing({ pets_on_premises: true, large_dog_disclosure: "Rottweiler on site" }) });
    await show(<ListingDetailScreen id="l1" />);
    await screen.findByText("Rottweiler on site");
  });

  it("falls back to a reminder about pets when the note is blank", async () => {
    startServer({ listing: aListing({ pets_on_premises: true, large_dog_disclosure: "  " }) });
    await show(<ListingDetailScreen id="l1" />);
    await screen.findByText(/You've said pets live here/);
  });

  it("keeps what it had and says so when a reload fails", async () => {
    const server = startServer();
    await show(<ListingDetailScreen id="l1" />);
    await screen.findByText("Garden room");
    server.listing = 500;
    await act(async () => {
      await store.dispatch(listingsApi.endpoints.getListingById.initiate("l1", { forceRefetch: true }));
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Garden room")).toBeTruthy();
  });

  it("still offers the website", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    startServer();
    await show(<ListingDetailScreen id="l1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Open on the website" }));
    expect(openURL).toHaveBeenCalledWith(`${WEB_BASE_URL}/listings/l1`);
  });

  it("says when the listing has gone, and goes back", async () => {
    startServer({ listing: 404 });
    await show(<ListingDetailScreen id="l1" />);
    await screen.findByText("I can't find that listing.");
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("offers a retry when it couldn't load, and recovers", async () => {
    const server = startServer({ listing: 500 });
    await show(<ListingDetailScreen id="l1" />);
    await screen.findByText("I couldn't load that listing.");
    server.listing = aListing();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Garden room");
  });
});
