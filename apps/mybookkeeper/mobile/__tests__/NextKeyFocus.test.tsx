import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TextInput } from "react-native";
import { Provider } from "react-redux";
import { MEMBERS_MESSAGES as MEMBERS } from "../src/constants/members";
import { PROPERTY_FORM_MESSAGES as FORM } from "../src/constants/propertyForm";
import { VENDOR_FORM_MESSAGES as VENDOR } from "../src/constants/vendorForm";
import InviteSheet from "../src/features/members/InviteSheet";
import WelcomeManualSectionFormScreen from "../src/features/welcomeManuals/WelcomeManualSectionFormScreen";
import PropertyFormScreen from "../src/features/properties/PropertyFormScreen";
import VendorFormScreen from "../src/features/vendors/VendorFormScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { aManual } from "../test-support/aWelcomeManual";
import { store } from "../src/lib/store";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePreventRemove: () => undefined,
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

beforeEach(() => {
  (TextInput.prototype.focus as jest.Mock).mockClear();
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
});

function inStore(element: React.ReactElement) {
  return (
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>
  );
}

const focused = () => (TextInput.prototype.focus as jest.Mock).mock.contexts.map((input: { props: { accessibilityLabel: string } }) => input.props.accessibilityLabel);

describe("the Next key on a form", () => {
  it("moves the property form from name to street, city, state, ZIP and purchase price, keeping the keyboard up", async () => {
    await render(inStore(<PropertyFormScreen original={null} />));
    const labels = [...[FORM.name, FORM.street, FORM.city, FORM.state, FORM.zip].map((label) => `${label}, required`), FORM.purchasePrice];
    const inputs = labels.map((label) => screen.getByLabelText(label));
    // ZIP isn't the last field: Next goes on past the type picker to the purchase price.
    expect(inputs.map((input) => input.props.returnKeyType)).toEqual(["next", "next", "next", "next", "next", "done"]);
    // The keyboard stays up between fields; only Next's handler moves the cursor.
    for (const input of inputs.slice(0, 5)) expect(input.props.submitBehavior).toBe("submit");
    // Under Jest every TextInput shares one focus() spy, which records the input it was called on.
    for (let step = 0; step < 5; step += 1) {
      await fireEvent(inputs[step], "submitEditing");
      expect(focused()).toEqual(labels.slice(1, step + 2));
    }
  });

  it("moves a vendor from name to phone, email, address, hourly rate and flat-rate notes", async () => {
    await render(inStore(<VendorFormScreen original={null} />));
    const labels = [`${VENDOR.name}, required`, VENDOR.phone, VENDOR.email, VENDOR.address, VENDOR.hourlyRate, VENDOR.flatRates];
    const inputs = labels.map((label) => screen.getByLabelText(label));
    // The name used to say Done mid-form, closing the keyboard.
    expect(inputs.slice(0, 5).map((input) => input.props.returnKeyType)).toEqual(["next", "next", "next", "next", "next"]);
    for (let step = 0; step < 5; step += 1) {
      await fireEvent(inputs[step], "submitEditing");
      expect(focused()).toEqual(labels.slice(1, step + 2));
    }
  });

  it("sends an invite from the email field's Send key, once", async () => {
    const onSend = jest.fn(() => new Promise<string | null>(() => undefined));
    await render(inStore(<InviteSheet initialEmail="" initialRole="viewer" onClose={jest.fn()} onSend={onSend} orgName="Acme" />));
    const email = screen.getByLabelText(MEMBERS.email);
    expect(email.props.returnKeyType).toBe("send");
    await fireEvent.changeText(email, "Sam@Example.com ");
    await fireEvent(email, "submitEditing");
    await fireEvent(email, "submitEditing");
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("sam@example.com", "viewer");
  });

  it("moves a manual section from its title to its text", async () => {
    await render(inStore(<WelcomeManualSectionFormScreen manual={aManual()} original={null} />));
    const title = screen.getByLabelText("Title, required");
    expect(title.props.returnKeyType).toBe("next");
    expect(title.props.submitBehavior).toBe("submit");
    await fireEvent(title, "submitEditing");
    expect(focused()).toEqual(["Text"]);
  });
});
