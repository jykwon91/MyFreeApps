import { VENDOR_PAGE_SIZE } from "@mybookkeeper/api-client/constants/vendorLabels";
import { vendorsApi } from "@mybookkeeper/api-client/store/vendorsApi";
import type { VendorResponse } from "@mybookkeeper/api-client/types/vendor/vendor-response";
import type { VendorSummary } from "@mybookkeeper/api-client/types/vendor/vendor-summary";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Linking, Platform } from "react-native";
import { Provider } from "react-redux";
import { VENDOR_FILTER_MESSAGES, VENDOR_MESSAGES } from "../src/constants/vendors";
import { directionsUrl } from "../src/features/vendors/vendorDisplay";
import VendorDetailScreen from "../src/features/vendors/VendorDetailScreen";
import VendorsScreen from "../src/features/vendors/VendorsScreen";
import { store } from "../src/lib/store";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack() },
}));

const originalAdapter = api.defaults.adapter;

function aSummary(overrides: Partial<VendorSummary> = {}): VendorSummary {
  return {
    id: "v1",
    organization_id: "o1",
    user_id: "u1",
    name: "Reliable Plumbing",
    category: "plumber",
    phone: "(555) 010-1000",
    hourly_rate: "95.00",
    preferred: false,
    last_used_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function aVendor(overrides: Partial<VendorResponse> = {}): VendorResponse {
  return {
    ...aSummary(),
    email: "help@reliable.example",
    address: "12 Pipe Lane, Austin",
    flat_rate_notes: "$150 for a clogged drain",
    notes: "Ask for Sam",
    ...overrides,
  };
}

type Answer = unknown | "fail" | "gone" | "hold";

interface Server {
  list: Answer;
  detail: Answer;
  listRequests: AxiosRequestConfig[];
}

function startServer(list: Answer, detail: Answer = aVendor()): Server {
  const server: Server = { list, detail, listRequests: [] };
  const adapter: AxiosAdapter = async (config) => {
    if (config.url === "/organizations") return { data: [], status: 200, statusText: "OK", headers: {}, config };
    const isList = config.url === "/vendors";
    if (isList) server.listRequests.push(config);
    const answer = isList ? server.list : server.detail;
    if (answer === "hold") return new Promise(() => undefined);
    if (answer === "fail") return Promise.reject({ response: { status: 500, data: {} }, config, isAxiosError: true });
    if (answer === "gone") return Promise.reject({ response: { status: 404, data: {} }, config, isAxiosError: true });
    return { data: answer, status: 200, statusText: "OK", headers: {}, config };
  };
  api.defaults.adapter = adapter;
  return server;
}

function aPage(items: VendorSummary[], hasMore = false) {
  return { items, total: items.length, has_more: hasMore };
}

async function show(screenElement: React.ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{screenElement}</ToastProvider>
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

describe("VendorsScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer("hold");
    await show(<VendorsScreen />);
    expect(await screen.findByTestId("vendors-skeleton")).toBeTruthy();
  });

  it("opens the vendor when the row is tapped", async () => {
    startServer(aPage([aSummary({ preferred: true })]));
    await show(<VendorsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Reliable Plumbing, Plumber, Preferred" }));
    expect(mockPush).toHaveBeenCalledWith("/vendors/v1");
  });

  it("calls from the row without opening the vendor", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    startServer(aPage([aSummary()]));
    await show(<VendorsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Call Reliable Plumbing, (555) 010-1000" }));
    expect(openURL).toHaveBeenCalledWith("tel:5550101000");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each([null, "ask at the shop", "1-800-FLOWERS", "555-010-1000 / 555-010-2000", "555-1234 #5", "911"])("offers no call when the phone is %s", async (phone) => {
    startServer(aPage([aSummary({ phone })]));
    await show(<VendorsScreen />);
    await screen.findByText("Reliable Plumbing");
    expect(screen.queryByText("Call")).toBeNull();
  });

  it("filters by category in a sheet, and offers a way out when nobody matches", async () => {
    const server = startServer(aPage([aSummary()]));
    await show(<VendorsScreen />);
    await screen.findByText("Reliable Plumbing");
    server.list = aPage([]);
    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    await fireEvent.press(await screen.findByText("HVAC"));
    await fireEvent.press(screen.getByRole("button", { name: VENDOR_FILTER_MESSAGES.done }));
    await screen.findByText(VENDOR_MESSAGES.noMatches);
    expect(server.listRequests.at(-1)?.params).toMatchObject({ category: "hvac", limit: VENDOR_PAGE_SIZE, offset: 0 });
    server.list = aPage([aSummary()]);
    await fireEvent.press(screen.getByRole("button", { name: VENDOR_MESSAGES.clearFilters }));
    await screen.findByText("Reliable Plumbing");
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
  });

  it("filters to preferred vendors, and says so on the button", async () => {
    const server = startServer(aPage([aSummary()]));
    await show(<VendorsScreen />);
    await screen.findByText("Reliable Plumbing");
    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    await fireEvent(screen.getByLabelText(VENDOR_FILTER_MESSAGES.preferredOnly), "valueChange", true);
    await fireEvent.press(screen.getByRole("button", { name: VENDOR_FILTER_MESSAGES.done }));
    await waitFor(() => expect(server.listRequests.at(-1)?.params).toMatchObject({ preferred: true }));
    expect(screen.getByRole("button", { name: "Filters: Preferred" })).toBeTruthy();
  });

  it("combines the category and preferred filters, and clears both from the sheet", async () => {
    const server = startServer(aPage([aSummary()]));
    await show(<VendorsScreen />);
    await screen.findByText("Reliable Plumbing");
    await fireEvent.press(screen.getByRole("button", { name: "Filters" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Plumber" }));
    await fireEvent(screen.getByLabelText(VENDOR_FILTER_MESSAGES.preferredOnly), "valueChange", true);
    await fireEvent.press(screen.getByRole("button", { name: VENDOR_FILTER_MESSAGES.done }));
    await waitFor(() => expect(server.listRequests.at(-1)?.params).toMatchObject({ category: "plumber", preferred: true }));
    expect(screen.getByRole("button", { name: "Filters: Plumber, Preferred" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filters: Plumber, Preferred" }));
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_FILTER_MESSAGES.clear }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy());
  });

  it("loads the next page at the end of the list", async () => {
    const server = startServer(aPage([aSummary()], true));
    await show(<VendorsScreen />);
    await screen.findByText("Reliable Plumbing");
    server.list = aPage([aSummary({ id: "v2", name: "Bright Electric", category: "electrician" })]);
    await act(async () => {
      await screen.getByTestId("vendors-list").props.onEndReached();
    });
    await screen.findByText("Bright Electric");
    expect(server.listRequests.at(-1)?.params).toMatchObject({ offset: VENDOR_PAGE_SIZE });
  });

  it("keeps saying there are none during a reload", async () => {
    const server = startServer(aPage([]));
    await show(<VendorsScreen />);
    await screen.findByText(VENDOR_MESSAGES.noneHeading);
    server.list = "hold";
    await act(async () => {
      void screen.getByTestId("vendors-list").props.refreshControl.props.onRefresh();
    });
    expect(screen.getByText(VENDOR_MESSAGES.noneHeading)).toBeTruthy();
    expect(screen.queryByTestId("vendors-skeleton")).toBeNull();
  });

  it("offers a retry when the first load fails, and recovers", async () => {
    const server = startServer("fail");
    await show(<VendorsScreen />);
    await screen.findByText("I couldn't load your vendors.");
    server.list = aPage([aSummary()]);
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Reliable Plumbing");
  });

  it("keeps what it had and says so when a pull to refresh fails", async () => {
    const server = startServer(aPage([aSummary()]));
    await show(<VendorsScreen />);
    await screen.findByText("Reliable Plumbing");
    server.list = "fail";
    await act(async () => {
      await screen.getByTestId("vendors-list").props.refreshControl.props.onRefresh();
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Reliable Plumbing")).toBeTruthy();
  });
});

describe("VendorDetailScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer(aPage([]), "hold");
    await show(<VendorDetailScreen id="v1" />);
    expect(await screen.findByTestId("vendor-detail-skeleton")).toBeTruthy();
  });

  it("shows everything saved about the vendor", async () => {
    startServer(aPage([]), aVendor({ preferred: true }));
    await show(<VendorDetailScreen id="v1" />);
    await screen.findByText("Reliable Plumbing");
    for (const text of ["Plumber", "Preferred", "12 Pipe Lane, Austin", "$95 an hour", "$150 for a clogged drain", "Ask for Sam"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("calls, texts, emails and gets directions", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    startServer(aPage([]));
    await show(<VendorDetailScreen id="v1" />);
    await screen.findByText("Reliable Plumbing");
    await fireEvent.press(screen.getByRole("button", { name: "Call Reliable Plumbing, (555) 010-1000" }));
    expect(openURL).toHaveBeenLastCalledWith("tel:5550101000");
    await fireEvent.press(screen.getByRole("button", { name: "Text Reliable Plumbing, (555) 010-1000" }));
    expect(openURL).toHaveBeenLastCalledWith("sms:5550101000");
    await fireEvent.press(screen.getByRole("button", { name: "Email Reliable Plumbing, help@reliable.example" }));
    expect(openURL).toHaveBeenLastCalledWith("mailto:help%40reliable.example");
    await fireEvent.press(screen.getByRole("button", { name: "Directions to Reliable Plumbing" }));
    expect(openURL).toHaveBeenLastCalledWith(directionsUrl("12 Pipe Lane, Austin", Platform.OS));
  });

  it("builds a maps link for each phone and keeps the address in one piece", () => {
    expect(directionsUrl("12 Pipe Ln #4, Austin", "ios")).toBe("https://maps.apple.com/?q=12%20Pipe%20Ln%20%234%2C%20Austin");
    expect(directionsUrl("12 Pipe Ln #4, Austin", "android")).toBe("geo:0,0?q=12%20Pipe%20Ln%20%234%2C%20Austin");
  });

  it("leaves out what the vendor doesn't have", async () => {
    startServer(aPage([]), aVendor({ phone: null, email: null, address: "  ", hourly_rate: null, flat_rate_notes: null, notes: null }));
    await show(<VendorDetailScreen id="v1" />);
    await screen.findByText("No phone number or email.");
    for (const label of ["Directions", "Address", "Hourly rate", "Flat rates", "Notes"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("still shows a phone it can't dial, without a button that would ring someone else", async () => {
    startServer(aPage([]), aVendor({ phone: "1-800-FLOWERS", email: null }));
    await show(<VendorDetailScreen id="v1" />);
    await screen.findByText("Phone: 1-800-FLOWERS");
    expect(screen.queryByText("No phone number or email.")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Call/ })).toBeNull();
  });

  it("dials a plain number with an extension, a country code or a short local number", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    for (const [phone, url] of [["555-010-1000 ext. 12", "tel:5550101000"], ["+1 (555) 010-1000", "tel:+15550101000"], ["555-1234", "tel:5551234"]] as const) {
      store.dispatch(baseApi.util.resetApiState());
      startServer(aPage([]), aVendor({ phone }));
      const { unmount } = await render(
        <Provider store={store}>
          <ToastProvider bottomOffset={0}>
            <VendorDetailScreen id="v1" />
          </ToastProvider>
        </Provider>,
      );
      await fireEvent.press(await screen.findByRole("button", { name: `Call Reliable Plumbing, ${phone}` }));
      expect(openURL).toHaveBeenLastCalledWith(url);
      await unmount();
    }
  });

  it("says when the vendor is gone, and offers a way back", async () => {
    startServer(aPage([]), "gone");
    await show(<VendorDetailScreen id="v1" />);
    await screen.findByText("I can't find that vendor.");
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("offers a retry when it couldn't load, and recovers", async () => {
    const server = startServer(aPage([]), "fail");
    await show(<VendorDetailScreen id="v1" />);
    await screen.findByText("I couldn't load that vendor.");
    server.detail = aVendor();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Reliable Plumbing");
  });

  it("keeps what it had when a reload fails", async () => {
    const server = startServer(aPage([]));
    await show(<VendorDetailScreen id="v1" />);
    await screen.findByText("Reliable Plumbing");
    server.detail = "fail";
    await act(async () => {
      await store.dispatch(vendorsApi.endpoints.getVendorById.initiate("v1", { forceRefetch: true }));
    });
    await waitFor(() => expect(screen.getByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy());
    expect(screen.getByText("Reliable Plumbing")).toBeTruthy();
  });
});
