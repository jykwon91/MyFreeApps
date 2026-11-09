import { propertiesApi } from "@mybookkeeper/api-client/store/propertiesApi";
import type { Property } from "@mybookkeeper/api-client/types/property/property";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import PropertiesScreen from "../src/features/properties/PropertiesScreen";
import { store } from "../src/lib/store";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn() } }));

const originalAdapter = api.defaults.adapter;

function aProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "p1",
    name: "Elm House",
    address: "1 Elm St",
    classification: "investment",
    type: "long_term",
    is_active: true,
    activity_periods: [],
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

interface Server {
  properties: Property[] | "fail" | "hold";
}

function startServer(properties: Server["properties"]): Server {
  const server: Server = { properties };
  const adapter: AxiosAdapter = async (config) => {
    if (server.properties === "hold") return new Promise(() => undefined);
    if (server.properties === "fail") return Promise.reject({ response: { status: 500, data: {} }, config, isAxiosError: true });
    return { data: server.properties, status: 200, statusText: "OK", headers: {}, config };
  };
  api.defaults.adapter = adapter;
  return server;
}

async function show() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <PropertiesScreen />
      </ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("PropertiesScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer("hold");
    await show();
    expect(await screen.findByTestId("properties-skeleton")).toBeTruthy();
  });

  it("shows a property's name, address and use, with no chips when it's in order", async () => {
    startServer([aProperty()]);
    await show();
    await screen.findByText("Elm House");
    expect(screen.getByText("1 Elm St")).toBeTruthy();
    expect(screen.getByText("Investment Property · Long-Term Rental")).toBeTruthy();
    expect(screen.queryByText("Inactive")).toBeNull();
    expect(screen.queryByText("Needs classification")).toBeNull();
    expect(screen.getByLabelText("Elm House, 1 Elm St, Investment Property · Long-Term Rental")).toBeTruthy();
  });

  it("marks one that's inactive, and leaves out a rental type it doesn't have", async () => {
    startServer([aProperty({ classification: "second_home", type: null, is_active: false, address: null })]);
    await show();
    await screen.findByText("Inactive");
    expect(screen.getByText("Second Home")).toBeTruthy();
  });

  it("counts what needs classifying and marks each row", async () => {
    startServer([aProperty({ classification: "unclassified", type: null }), aProperty({ id: "p2", name: "Oak Flat", classification: "unclassified", type: null })]);
    await show();
    await screen.findByText("2 properties need classifying.");
    expect(screen.getAllByText("Needs classification")).toHaveLength(2);
  });

  it("says one property, and reads out everything about a row with both chips", async () => {
    startServer([aProperty({ classification: "unclassified", type: null, is_active: false })]);
    await show();
    await screen.findByText("1 property needs classifying.");
    expect(screen.getByText("Inactive")).toBeTruthy();
    expect(screen.getByText("Needs classification")).toBeTruthy();
    expect(screen.getByLabelText("Elm House, 1 Elm St, Inactive, Needs classification")).toBeTruthy();
  });

  it("picks up changes when pulled down", async () => {
    const server = startServer([aProperty()]);
    await show();
    await screen.findByText("Elm House");
    server.properties = [aProperty({ name: "Elm Cottage" })];
    const refreshControl = screen.getByTestId("properties-list").props.refreshControl;
    await act(async () => {
      await refreshControl.props.onRefresh();
    });
    await screen.findByText("Elm Cottage");
  });

  it("offers a retry when the first load fails, and recovers", async () => {
    const server = startServer("fail");
    await show();
    await screen.findByText("I couldn't load your properties.");
    server.properties = [aProperty()];
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Elm House");
  });

  it("keeps what it had and says so when a reload fails", async () => {
    const server = startServer([aProperty()]);
    await show();
    await screen.findByText("Elm House");
    server.properties = "fail";
    await act(async () => {
      await store.dispatch(propertiesApi.endpoints.getProperties.initiate(undefined, { forceRefetch: true }));
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Elm House")).toBeTruthy();
  });
});
