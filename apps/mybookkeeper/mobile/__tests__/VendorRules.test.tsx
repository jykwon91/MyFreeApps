import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { FORM_MESSAGES } from "../src/constants/forms";
import { DELETE_VENDOR_RULE_BODY, deleteVendorRuleTitle, VENDOR_RULE_FILTER_MESSAGES, VENDOR_RULE_MESSAGES } from "../src/constants/vendorRules";
import VendorRuleDetailScreen from "../src/features/vendorRules/VendorRuleDetailScreen";
import VendorRulesScreen from "../src/features/vendorRules/VendorRulesScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aProperty } from "../test-support/propertiesVendorsServer";
import { aRule, deletesOf, startClassificationRulesServer } from "../test-support/classificationRulesServer";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function show(element: React.ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

const rules = [
  aRule({ id: "r1", match_pattern: "home depot", match_type: "vendor" }),
  aRule({ id: "r2", match_pattern: "noreply@utility.example", match_type: "sender", category: "utilities", source: "manual", times_applied: 0 }),
];

async function confirmDelete() {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((candidate) => candidate.text === VENDOR_RULE_MESSAGES.delete)?.onPress?.());
}

describe("the vendor rules list", () => {
  it("shows each rule under its match type with the category and how often it was used", async () => {
    startClassificationRulesServer({ rules });
    await show(<VendorRulesScreen />);
    await screen.findByText("home depot");
    expect(screen.getByRole("header", { name: "Vendor" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Sender" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "home depot, Maintenance, Used 3 times" })).toBeTruthy();
    expect(screen.getByText("2 rules total")).toBeTruthy();
    expect(screen.getByRole("button", { name: "noreply@utility.example, Utilities, Never used" })).toBeTruthy();
  });

  it("names the property on a rule that belongs to one", async () => {
    startClassificationRulesServer({ rules: [aRule({ property_id: "p1" })], properties: [aProperty()] });
    await show(<VendorRulesScreen />);
    await screen.findByRole("button", { name: "home depot, Maintenance, Used 3 times, Elm House" });
  });

  it("shows skeleton rows while the rules load", async () => {
    startClassificationRulesServer({ rules }).holdReads = true;
    await show(<VendorRulesScreen />);
    expect(await screen.findByTestId("vendor-rules-skeleton")).toBeTruthy();
  });

  it("opens a rule on its own screen", async () => {
    startClassificationRulesServer({ rules });
    await show(<VendorRulesScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: /^home depot/ }));
    expect(mockPush).toHaveBeenCalledWith("/vendor-rules/r1");
  });

  it("narrows to one match type from the filter sheet, and shows all again on clear", async () => {
    startClassificationRulesServer({ rules });
    await show(<VendorRulesScreen />);
    await screen.findByText("home depot");
    await fireEvent.press(screen.getByRole("button", { name: VENDOR_RULE_FILTER_MESSAGES.button }));
    expect(await screen.findByRole("radio", { name: "All types (2)" })).toBeTruthy();
    await fireEvent.press(await screen.findByRole("radio", { name: "Sender (1)" }));
    await fireEvent.press(screen.getByRole("button", { name: VENDOR_RULE_FILTER_MESSAGES.done }));
    await waitFor(() => expect(screen.queryByText("home depot")).toBeNull());
    expect(screen.getByText("noreply@utility.example")).toBeTruthy();
    expect(screen.getByRole("button", { name: `${VENDOR_RULE_FILTER_MESSAGES.button}: Sender` })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: `${VENDOR_RULE_FILTER_MESSAGES.button}: Sender` }));
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_RULE_FILTER_MESSAGES.clear }));
    await screen.findByText("home depot");
  });

  it("explains when there are no rules yet", async () => {
    startClassificationRulesServer({ rules: [] });
    await show(<VendorRulesScreen />);
    await screen.findByText(VENDOR_RULE_MESSAGES.noneHeading);
    expect(screen.getByText(VENDOR_RULE_MESSAGES.noneBody)).toBeTruthy();
  });

  it("says it couldn't load, and tries again", async () => {
    const server = startClassificationRulesServer({ rules });
    server.failReadsWith = 500;
    await show(<VendorRulesScreen />);
    await screen.findByText(VENDOR_RULE_MESSAGES.couldntLoadList);
    server.failReadsWith = null;
    await fireEvent.press(screen.getByRole("button", { name: VENDOR_RULE_MESSAGES.tryAgain }));
    await screen.findByText("home depot");
  });

  it("tells a viewer the list is read-only", async () => {
    startClassificationRulesServer({ rules, role: "viewer" });
    await show(<VendorRulesScreen />);
    await screen.findByText("home depot");
    expect(screen.getByText(VENDOR_RULE_MESSAGES.viewOnly)).toBeTruthy();
  });

  it("does not show the read-only note to an owner", async () => {
    startClassificationRulesServer({ rules });
    await show(<VendorRulesScreen />);
    await screen.findByText("home depot");
    expect(screen.queryByText(VENDOR_RULE_MESSAGES.viewOnly)).toBeNull();
  });
});

describe("a rule's own screen", () => {
  it("shows what the rule matches, what it sets, where, and how it was made", async () => {
    startClassificationRulesServer({ rules: [aRule({ property_id: "p1", match_context: "invoice" })], properties: [aProperty()] });
    await show(<VendorRuleDetailScreen id="r1" />);
    await screen.findByText("Learned from your correction");
    expect(screen.getByText("Maintenance")).toBeTruthy();
    expect(await screen.findByText("Elm House")).toBeTruthy();
    expect(screen.getByText("invoice")).toBeTruthy();
    expect(screen.getByText("Used 3 times")).toBeTruthy();
  });

  it("shows when the rule was added", async () => {
    startClassificationRulesServer({ rules });
    await show(<VendorRuleDetailScreen id="r1" />);
    expect(await screen.findByText("October 1, 2026")).toBeTruthy();
  });

  it("shows a skeleton shaped like the rule while it loads", async () => {
    startClassificationRulesServer({ rules }).holdReads = true;
    await show(<VendorRuleDetailScreen id="r1" />);
    expect(await screen.findByTestId("vendor-rule-detail-skeleton")).toBeTruthy();
  });

  it("says it couldn't load the rule, and tries again", async () => {
    const server = startClassificationRulesServer({ rules });
    server.failReadsWith = 500;
    await show(<VendorRuleDetailScreen id="r1" />);
    await screen.findByText(VENDOR_RULE_MESSAGES.couldntLoadOne);
    server.failReadsWith = null;
    await fireEvent.press(screen.getByRole("button", { name: VENDOR_RULE_MESSAGES.tryAgain }));
    await screen.findByText("Learned from your correction");
  });

  it("shows the property as loading, not as a guess, until the names arrive", async () => {
    startClassificationRulesServer({ rules: [aRule({ property_id: "p1" })], properties: [aProperty()] }).holdProperties = true;
    await show(<VendorRuleDetailScreen id="r1" />);
    await screen.findByText(VENDOR_RULE_MESSAGES.propertyPending);
    expect(screen.queryByText(VENDOR_RULE_MESSAGES.propertyMissing)).toBeNull();
  });

  it("says when the property name couldn't load, and retries it", async () => {
    const server = startClassificationRulesServer({ rules: [aRule({ property_id: "p1" })], properties: [aProperty()] });
    server.failPropertiesWith = 500;
    await show(<VendorRuleDetailScreen id="r1" />);
    await screen.findByText(VENDOR_RULE_MESSAGES.propertyLoadFailed);
    server.failPropertiesWith = null;
    await fireEvent.press(screen.getByRole("button", { name: VENDOR_RULE_MESSAGES.tryAgain }));
    await screen.findByText("Elm House");
  });

  it("gives a viewer no delete button", async () => {
    startClassificationRulesServer({ rules, role: "viewer" });
    await show(<VendorRuleDetailScreen id="r1" />);
    await screen.findByText("Learned from your correction");
    expect(screen.queryByRole("button", { name: VENDOR_RULE_MESSAGES.delete })).toBeNull();
  });

  it("gives a plain member no delete button either, since only owners and admins can delete", async () => {
    startClassificationRulesServer({ rules, role: "user" });
    await show(<VendorRuleDetailScreen id="r1" />);
    await screen.findByText("Learned from your correction");
    expect(screen.queryByRole("button", { name: VENDOR_RULE_MESSAGES.delete })).toBeNull();
  });

  it("asks first, then deletes, leaves and says so", async () => {
    const server = startClassificationRulesServer({ rules });
    await show(<VendorRuleDetailScreen id="r1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_RULE_MESSAGES.delete }));
    expect(alertSpy).toHaveBeenCalledWith(deleteVendorRuleTitle("home depot"), DELETE_VENDOR_RULE_BODY, expect.any(Array), expect.anything());
    expect(deletesOf(server)).toEqual([]);
    await confirmDelete();
    await screen.findByText(VENDOR_RULE_MESSAGES.deleted);
    expect(deletesOf(server)).toEqual(["/classification-rules/r1"]);
    expect(mockBack).toHaveBeenCalled();
  });

  it("does not delete when the question is cancelled", async () => {
    const server = startClassificationRulesServer({ rules });
    await show(<VendorRuleDetailScreen id="r1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_RULE_MESSAGES.delete }));
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((candidate) => candidate.text === FORM_MESSAGES.cancel)?.onPress?.());
    expect(deletesOf(server)).toEqual([]);
  });

  it("sends only one delete when the confirm is tapped twice", async () => {
    const server = startClassificationRulesServer({ rules });
    await show(<VendorRuleDetailScreen id="r1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_RULE_MESSAGES.delete }));
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    const confirm = buttons.find((candidate) => candidate.text === VENDOR_RULE_MESSAGES.delete);
    await act(async () => {
      confirm?.onPress?.();
      confirm?.onPress?.();
    });
    await screen.findByText(VENDOR_RULE_MESSAGES.deleted);
    expect(deletesOf(server)).toHaveLength(1);
  });

  it("lets an admin delete too", async () => {
    const server = startClassificationRulesServer({ rules, role: "admin" });
    await show(<VendorRuleDetailScreen id="r1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_RULE_MESSAGES.delete }));
    await confirmDelete();
    await screen.findByText(VENDOR_RULE_MESSAGES.deleted);
    expect(deletesOf(server)).toEqual(["/classification-rules/r1"]);
  });

  it("shows a banner and stays when the server fails the delete (500)", async () => {
    const server = startClassificationRulesServer({ rules });
    await show(<VendorRuleDetailScreen id="r1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_RULE_MESSAGES.delete }));
    server.failDeletesWith = 500;
    await confirmDelete();
    await screen.findByText("I couldn't delete that rule. Want to try again?");
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.queryByText(VENDOR_RULE_MESSAGES.deleted)).toBeNull();
  });

  it("shows a banner and stays when the connection is lost", async () => {
    const server = startClassificationRulesServer({ rules });
    await show(<VendorRuleDetailScreen id="r1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_RULE_MESSAGES.delete }));
    server.deletesLoseConnection = true;
    await confirmDelete();
    await screen.findByText("I can't reach the server, so I couldn't delete that rule.");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("treats a rule someone else already deleted (404) as done", async () => {
    const server = startClassificationRulesServer({ rules });
    await show(<VendorRuleDetailScreen id="r1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_RULE_MESSAGES.delete }));
    server.rules = [];
    await confirmDelete();
    await screen.findByText(VENDOR_RULE_MESSAGES.alreadyDeleted);
    expect(mockBack).toHaveBeenCalled();
  });

  it("says a delete was refused (403) because of the role, and stays", async () => {
    const server = startClassificationRulesServer({ rules });
    await show(<VendorRuleDetailScreen id="r1" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_RULE_MESSAGES.delete }));
    server.role = "viewer";
    await confirmDelete();
    await screen.findByText("You have view-only access, so I can't delete this.");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("says when the rule is gone", async () => {
    startClassificationRulesServer({ rules });
    await show(<VendorRuleDetailScreen id="nope" />);
    await fireEvent.press(await screen.findByRole("button", { name: VENDOR_RULE_MESSAGES.back }));
    expect(mockBack).toHaveBeenCalled();
  });
});
