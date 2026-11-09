import api from "@platform/core/lib/api";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import EditPolicyScreen from "../src/features/insurance/EditPolicyScreen";
import NewPolicyScreen from "../src/features/insurance/NewPolicyScreen";
import { aPolicyDetail, aProperty, lastInsuranceWrite, startInsuranceServer } from "../test-support/insuranceServer";
import { POLICY_FORM_MESSAGES } from "../src/constants/insuranceForm";
import { renderInsurance, resetInsuranceStore } from "../test-support/renderInsurance";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockPreventRemove = { active: false, callback: null as null | ((event: { repeat: () => void }) => void) };
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), push: (path: string) => mockPush(path) },
  usePreventRemove: (active: boolean, callback: (event: { repeat: () => void }) => void) => {
    mockPreventRemove.active = active;
    mockPreventRemove.callback = callback;
  },
}));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: jest.fn() } }));
jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  resetInsuranceStore();
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function chooseProperty(name = "Oak Street") {
  await fireEvent.press(await screen.findByLabelText("Property *, Choose a property"));
  await fireEvent.press(await screen.findByRole("radio", { name }));
}

async function fillAdd(policyName = "Landlord policy") {
  await chooseProperty();
  await fireEvent.changeText(screen.getByLabelText("Policy name, required"), policyName);
}

describe("adding a policy", () => {
  it("saves it against the chosen property and goes back with a confirmation", async () => {
    const server = startInsuranceServer({ policies: [] });
    await renderInsurance(<NewPolicyScreen />);
    await fillAdd();
    await fireEvent.changeText(screen.getByLabelText("Carrier"), "Acme");
    await fireEvent.changeText(screen.getByLabelText("Premium (USD)"), "112");
    await fireEvent.press(screen.getByLabelText("Billed, Not set"));
    await fireEvent.press(await screen.findByRole("radio", { name: "Monthly" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save policy" }));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(lastInsuranceWrite(server)).toMatchObject({
      route: "POST /insurance-policies",
      body: { property_id: "pr1", policy_name: "Landlord policy", carrier: "Acme", premium_cents: 11200, premium_frequency: "monthly" },
    });
    expect(await screen.findByText("Policy added.")).toBeTruthy();
  });

  it("points at what is missing instead of sending", async () => {
    const server = startInsuranceServer({ policies: [] });
    await renderInsurance(<NewPolicyScreen />);
    await screen.findByLabelText("Property *, Choose a property");
    await fireEvent.press(screen.getByRole("button", { name: "Save policy" }));
    expect(await screen.findByText("Choose which property this covers.")).toBeTruthy();
    expect(screen.getByText("Give the policy a name.")).toBeTruthy();
    expect(lastInsuranceWrite(server)).toBeNull();
  });

  it("flags a wind and hail percentage over 100 and a negative amount", async () => {
    startInsuranceServer({ policies: [] });
    await renderInsurance(<NewPolicyScreen />);
    await fillAdd();
    await fireEvent.changeText(screen.getByLabelText("Wind and hail deductible (% of coverage)"), "120");
    await fireEvent.changeText(screen.getByLabelText("Deductible (USD)"), "-5");
    await fireEvent.press(screen.getByRole("button", { name: "Save policy" }));
    expect(await screen.findByText("Enter a percentage from 0 to 100.")).toBeTruthy();
    expect(screen.getByText("Enter an amount of zero or more.")).toBeTruthy();
  });

  it("sends a host with no properties to the phone's own add property screen", async () => {
    startInsuranceServer({ properties: [] });
    await renderInsurance(<NewPolicyScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Add a property" }));
    expect(mockPush).toHaveBeenCalledWith("/properties/new");
  });

  it("offers a retry when the properties won't load, and lists them once it works", async () => {
    const server = startInsuranceServer({ failures: { "GET /properties": 500 } });
    await renderInsurance(<NewPolicyScreen />);
    expect(await screen.findByText(POLICY_FORM_MESSAGES.propertiesFailed)).toBeTruthy();
    delete server.failures["GET /properties"];
    await fireEvent.press(screen.getByRole("button", { name: POLICY_FORM_MESSAGES.propertiesRetry }));
    await fireEvent.press(await screen.findByLabelText("Property *, Choose a property"));
    expect(await screen.findByRole("radio", { name: "Oak Street" })).toBeTruthy();
  });

  it("offers every property, a retired one too, as the website does", async () => {
    startInsuranceServer({ properties: [aProperty(), aProperty({ id: "old", name: "Old Place", is_active: false })] });
    await renderInsurance(<NewPolicyScreen />);
    await fireEvent.press(await screen.findByLabelText("Property *, Choose a property"));
    await screen.findByRole("radio", { name: "Oak Street" });
    expect(screen.getByRole("radio", { name: "Old Place" })).toBeTruthy();
  });

  it("with only retired properties, still lets the host pick one rather than showing the empty state", async () => {
    startInsuranceServer({ properties: [aProperty({ id: "old", name: "Old Place", is_active: false })] });
    await renderInsurance(<NewPolicyScreen />);
    await fireEvent.press(await screen.findByLabelText("Property *, Choose a property"));
    expect(await screen.findByRole("radio", { name: "Old Place" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a property" })).toBeNull();
  });

  it("asks how often a premium is billed instead of dropping it, and sends nothing", async () => {
    const server = startInsuranceServer({ policies: [] });
    await renderInsurance(<NewPolicyScreen />);
    await fillAdd();
    await fireEvent.changeText(screen.getByLabelText("Premium (USD)"), "112");
    await fireEvent.press(screen.getByRole("button", { name: "Save policy" }));
    expect(await screen.findByText("Choose how often this premium is billed.")).toBeTruthy();
    expect(lastInsuranceWrite(server)).toBeNull();
  });

  it("is closed to a viewer", async () => {
    startInsuranceServer({ role: "viewer" });
    await renderInsurance(<NewPolicyScreen />);
    expect(await screen.findByText("You have view-only access, so I can't change policies.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save policy" })).toBeNull();
  });

  it("disables the button and shows it saving while the request is on its way", async () => {
    startInsuranceServer({ policies: [] });
    const answer = api.defaults.adapter as (config: unknown) => Promise<unknown>;
    api.defaults.adapter = ((config: { method?: string }) => (config.method === "post" ? new Promise(() => undefined) : answer(config))) as never;
    await renderInsurance(<NewPolicyScreen />);
    await fillAdd();
    await fireEvent.press(screen.getByRole("button", { name: "Save policy" }));
    expect(await screen.findByText("Saving…")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Saving/ }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it.each([
    [403, "You have view-only access, so I can't change policies."],
    [404, "That property or policy isn't there any more."],
    [422, "I couldn't save that. Check the details and try again."],
    [409, "I couldn't save that. Want to try again?"],
  ])("a %s says %s and never shows the server's words", async (status, message) => {
    startInsuranceServer({ policies: [], failures: { "POST /insurance-policies": status } });
    await renderInsurance(<NewPolicyScreen />);
    await fillAdd();
    await fireEvent.press(screen.getByRole("button", { name: "Save policy" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText(/developer/)).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it.each([[500], ["offline" as const]])("after a %s, says to check before trying again, since it may have saved", async (failure) => {
    startInsuranceServer({ policies: [], failures: { "POST /insurance-policies": failure } });
    await renderInsurance(<NewPolicyScreen />);
    await fillAdd();
    await fireEvent.press(screen.getByRole("button", { name: "Save policy" }));
    expect(await screen.findByText(/may have saved\. Check your policies before you try again/)).toBeTruthy();
    expect(screen.getByLabelText("Policy name, required").props.value).toBe("Landlord policy");
  });

  it("asks before throwing away what was typed, and lets a clean form go", async () => {
    startInsuranceServer({ policies: [] });
    await renderInsurance(<NewPolicyScreen />);
    await screen.findByLabelText("Property *, Choose a property");
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(screen.getByLabelText("Policy name, required"), "Half done");
    expect(mockPreventRemove.active).toBe(true);
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => buttons?.find((b) => b.text === "Discard")?.onPress?.());
    const leave = jest.fn();
    await act(async () => mockPreventRemove.callback?.({ repeat: leave }));
    expect(alert).toHaveBeenCalledWith("Discard your changes?", "I haven't saved them yet.", expect.any(Array));
    expect(leave).toHaveBeenCalled();
  });
});

describe("editing a policy", () => {
  it("shows the stored values, keeps the property fixed, and sends the change", async () => {
    const server = startInsuranceServer({ policies: [aPolicyDetail({ premium_cents: 11200, premium_frequency: "monthly" })] });
    await renderInsurance(<EditPolicyScreen id="p1" />);
    expect((await screen.findByLabelText("Policy name, required")).props.value).toBe("Landlord policy");
    expect(screen.getByLabelText("Property, Oak Street").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByLabelText("Billed, Monthly")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Carrier"), "New Mutual");
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(lastInsuranceWrite(server)).toMatchObject({ route: "PATCH /insurance-policies/:id", body: { carrier: "New Mutual", policy_name: "Landlord policy" } });
    expect(await screen.findByText("Policy updated.")).toBeTruthy();
  });

  it("is closed to a viewer", async () => {
    startInsuranceServer({ role: "viewer" });
    await renderInsurance(<EditPolicyScreen id="p1" />);
    expect(await screen.findByText("You have view-only access, so I can't change policies.")).toBeTruthy();
  });

  it("says when the policy is gone", async () => {
    startInsuranceServer({ policies: [] });
    await renderInsurance(<EditPolicyScreen id="p1" />);
    expect(await screen.findByText("I can't find that policy.")).toBeTruthy();
  });

  it("shows a skeleton while loading", async () => {
    startInsuranceServer();
    const answer = api.defaults.adapter as (config: { url?: string }) => Promise<unknown>;
    api.defaults.adapter = ((config: { url?: string }) => (config.url === "/insurance-policies/p1" ? new Promise(() => undefined) : answer(config))) as never;
    await renderInsurance(<EditPolicyScreen id="p1" />);
    expect(await screen.findByTestId("policy-detail-skeleton")).toBeTruthy();
  });

  it.each([
    ["offline" as const, "I can't reach the server, so I couldn't save that. Your details are still here."],
    [403, "You have view-only access, so I can't change policies."],
    [404, "That property or policy isn't there any more."],
    [422, "I couldn't save that. Check the details and try again."],
    [500, "I couldn't save that. Want to try again?"],
  ])("a %s on save says %s", async (failure, message) => {
    startInsuranceServer({ failures: { "PATCH /insurance-policies/:id": failure } });
    await renderInsurance(<EditPolicyScreen id="p1" />);
    await fireEvent.changeText(await screen.findByLabelText("Carrier"), "Other");
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
