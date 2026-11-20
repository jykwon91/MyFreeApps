import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { DEPRECIATION_INPUT_MESSAGES as DEPRECIATION } from "@mybookkeeper/api-client/constants/depreciationInputs";
import { PROPERTY_FORM_MESSAGES as FORM } from "../src/constants/propertyForm";
import PropertyEditScreen from "../src/features/properties/PropertyEditScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { fullDateLabel } from "../src/lib/localDate";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aProperty, startPropertiesVendorsServer, writesOf } from "../test-support/propertiesVendorsServer";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePreventRemove: () => undefined,
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

async function showEdit() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <PropertyEditScreen id="p1" />
      </ToastProvider>
    </Provider>,
  );
  await screen.findByLabelText("Property name, required");
}

const rental = (overrides = {}) => aProperty({ purchase_price: "300000.00", ...overrides });
const button = (name: string) => screen.getByRole("button", { name });

describe("a rental's depreciation inputs", () => {
  it("saves the land value and date placed in service", async () => {
    const server = startPropertiesVendorsServer({ properties: [rental()] });
    await showEdit();

    await fireEvent.changeText(screen.getByLabelText(DEPRECIATION.landValue), "$25,000");
    await fireEvent.press(button("Choose date placed in service"));
    await act(async () => {
      screen.getByTestId(`${DEPRECIATION.placedInService}-picker`).props.onChange({ type: "set" }, new Date(2023, 2, 15));
    });
    await fireEvent.press(button(FORM.save));

    await screen.findByText(FORM.saved);
    const patches = writesOf(server, "patch");
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toMatchObject({ land_value: "25000.00", date_placed_in_service: "2023-03-15" });
  });

  it("starts from the saved values and sends nothing when they're unchanged", async () => {
    const server = startPropertiesVendorsServer({
      properties: [rental({ land_value: "25000.00", date_placed_in_service: "2023-03-15" })],
    });
    await showEdit();

    expect(screen.getByLabelText(DEPRECIATION.landValue).props.value).toBe("25000.00");
    expect(screen.getByText(fullDateLabel("2023-03-15"))).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Property name, required"), "Elm Cottage");
    await fireEvent.press(button(FORM.save));

    await screen.findByText(FORM.saved);
    const patches = writesOf(server, "patch");
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toMatchObject({ name: "Elm Cottage" });
    expect(patches[0].body).not.toHaveProperty("land_value");
    expect(patches[0].body).not.toHaveProperty("date_placed_in_service");
  });

  it("won't save land worth more than the purchase price, and says why", async () => {
    const server = startPropertiesVendorsServer({ properties: [rental()] });
    await showEdit();

    await fireEvent.changeText(screen.getByLabelText(DEPRECIATION.landValue), "350000");
    await fireEvent.press(button(FORM.save));

    expect(await screen.findByText(DEPRECIATION.landValueOverPrice)).toBeTruthy();
    expect(writesOf(server, "patch")).toEqual([]);
  });

  it("won't save a land value before there's a purchase price", async () => {
    const server = startPropertiesVendorsServer({ properties: [aProperty()] });
    await showEdit();

    await fireEvent.changeText(screen.getByLabelText(DEPRECIATION.landValue), "25000");
    await fireEvent.press(button(FORM.save));

    expect(await screen.findByText(DEPRECIATION.landValueNeedsPrice)).toBeTruthy();
    expect(writesOf(server, "patch")).toEqual([]);
  });

  it("isn't asked for a home that isn't a rental", async () => {
    startPropertiesVendorsServer({ properties: [rental({ classification: "primary_residence", type: null })] });
    await showEdit();

    expect(screen.getByLabelText(FORM.purchasePrice)).toBeTruthy();
    expect(screen.queryByLabelText(DEPRECIATION.landValue)).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose date placed in service" })).toBeNull();
  });
});
