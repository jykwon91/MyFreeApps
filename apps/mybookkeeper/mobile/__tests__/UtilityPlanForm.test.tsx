import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { UTILITY_PLAN_FORM_MESSAGES as MESSAGES } from "../src/constants/utilityPlanForm";
import { UTILITY_PLAN_MESSAGES } from "../src/constants/utilityPlans";
import UtilityPlanDetailScreen from "../src/features/utilityPlans/UtilityPlanDetailScreen";
import UtilityPlanEditScreen from "../src/features/utilityPlans/UtilityPlanEditScreen";
import UtilityPlanFormScreen from "../src/features/utilityPlans/UtilityPlanFormScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aUtilityPlanDetail } from "../test-support/aUtilityPlanDetail";
import { holdWrites } from "../test-support/holdWrites";
import { startUtilityServer, writesTo } from "../test-support/utilityPlansServer";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockPreventRemove = { active: false };
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), canGoBack: () => true, push: (path: string) => mockPush(path), replace: jest.fn() },
  usePreventRemove: (active: boolean) => {
    mockPreventRemove.active = active;
  },
}));
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
  mockPreventRemove.active = false;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function show(element: ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

async function pickOakStreet() {
  await fireEvent.press(await screen.findByLabelText(/^Property/));
  await fireEvent.press(await screen.findByRole("radio", { name: "Oak Street" }));
}

describe("adding a utility plan", () => {
  it("tells a viewer they cannot add", async () => {
    startUtilityServer({ role: "viewer" });
    await show(<UtilityPlanFormScreen />);
    expect(await screen.findByText(MESSAGES.viewOnlyHeading)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.saveNew })).toBeNull();
  });

  it("sends someone with no property to add one on the phone", async () => {
    startUtilityServer({ properties: [] });
    await show(<UtilityPlanFormScreen />);
    expect(await screen.findByText(MESSAGES.noProperties)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.addProperty }));
    expect(mockPush).toHaveBeenCalledWith("/properties/new");
  });

  it("asks for the property and the provider before sending anything", async () => {
    const server = startUtilityServer();
    await show(<UtilityPlanFormScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.saveNew }));
    expect(await screen.findByText(MESSAGES.propertyRequired)).toBeTruthy();
    expect(screen.getByText("Provider is required.")).toBeTruthy();
    expect(writesTo(server, "post")).toHaveLength(0);
  });

  it("adds the plan with money in cents and rates as typed, then leaves", async () => {
    const server = startUtilityServer();
    await show(<UtilityPlanFormScreen />);
    await pickOakStreet();
    await fireEvent.changeText(screen.getByLabelText(new RegExp(`^${MESSAGES.provider}`)), "Reliant");
    await fireEvent.changeText(screen.getByLabelText(new RegExp(`^${MESSAGES.energyCharge.replace(/[()/]/g, "\\$&")}`)), "8.5");
    await fireEvent.changeText(screen.getByLabelText(new RegExp(`^${MESSAGES.monthlyBase.replace(/[()$]/g, "\\$&")}`)), "4.95");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveNew }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(JSON.parse(String(writesTo(server, "post")[0].data))).toMatchObject({
      property_id: "pr1",
      service_type: "electricity",
      provider_name: "Reliant",
      energy_charge_cents_per_kwh: "8.5",
      monthly_base_charge_cents: 495,
    });
    expect(await screen.findByText(MESSAGES.added)).toBeTruthy();
  });

  it("guards leaving once something changed", async () => {
    startUtilityServer();
    await show(<UtilityPlanFormScreen />);
    const provider = await screen.findByLabelText(new RegExp(`^${MESSAGES.provider}`));
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(provider, "Reliant");
    expect(mockPreventRemove.active).toBe(true);
  });

  it("shows busy on the button at once and ignores a second press while saving", async () => {
    startUtilityServer();
    holdWrites();
    await show(<UtilityPlanFormScreen />);
    await pickOakStreet();
    await fireEvent.changeText(screen.getByLabelText(new RegExp(`^${MESSAGES.provider}`)), "Reliant");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveNew }));
    expect(await screen.findByText(MESSAGES.saving)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saving }));
    expect(screen.getByText(MESSAGES.saving)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("warns that a failed add may have saved, and keeps the typing", async () => {
    startUtilityServer({ write: 500 });
    await show(<UtilityPlanFormScreen />);
    await pickOakStreet();
    await fireEvent.changeText(screen.getByLabelText(new RegExp(`^${MESSAGES.provider}`)), "Reliant");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveNew }));
    expect(await screen.findByText(/I'm not sure that saved/)).toBeTruthy();
    expect(screen.queryByText(/raw server text/)).toBeNull();
    expect(screen.getByLabelText(new RegExp(`^${MESSAGES.provider}`)).props.value).toBe("Reliant");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("asks for the bill credit details once the switch is on", async () => {
    const server = startUtilityServer();
    await show(<UtilityPlanFormScreen />);
    await pickOakStreet();
    await fireEvent.changeText(screen.getByLabelText(new RegExp(`^${MESSAGES.provider}`)), "Reliant");
    await fireEvent(screen.getByLabelText(MESSAGES.hasBillCredit), "valueChange", true);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveNew }));
    expect(await screen.findAllByText(/credit/i)).not.toHaveLength(0);
    expect(writesTo(server, "post")).toHaveLength(0);
  });

  it("switches to the internet fields when the service is internet", async () => {
    startUtilityServer();
    await show(<UtilityPlanFormScreen />);
    await fireEvent.press(await screen.findByLabelText(new RegExp(`^${MESSAGES.service}`)));
    await fireEvent.press(await screen.findByRole("radio", { name: "Internet" }));
    expect(await screen.findByLabelText(new RegExp(`^${MESSAGES.download.replace(/[()]/g, "\\$&")}`))).toBeTruthy();
    expect(screen.queryByLabelText(new RegExp(`^${MESSAGES.minUsageFee.replace(/[()$]/g, "\\$&")}`))).toBeNull();
  });
});

describe("editing a utility plan", () => {
  it("tells a viewer they cannot edit", async () => {
    startUtilityServer({ role: "viewer", detail: aUtilityPlanDetail() });
    await show(<UtilityPlanEditScreen id="u1" />);
    expect(await screen.findByText(MESSAGES.viewOnlyHeading)).toBeTruthy();
  });

  it("says when the plan is gone", async () => {
    startUtilityServer({ detail: "gone" });
    await show(<UtilityPlanEditScreen id="u1" />);
    expect(await screen.findByText(UTILITY_PLAN_MESSAGES.cantFind)).toBeTruthy();
  });

  it("saves a changed provider, says so, and leaves", async () => {
    const server = startUtilityServer({ detail: aUtilityPlanDetail() });
    await show(<UtilityPlanEditScreen id="u1" />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MESSAGES.provider}`)), "Direct Energy");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveEdit }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(JSON.parse(String(writesTo(server, "patch")[0].data))).toMatchObject({ provider_name: "Direct Energy" });
    expect(await screen.findByText(MESSAGES.updated)).toBeTruthy();
  });

  it.each([
    [403, "You have view-only access, so I can't save this."],
    [404, "I can't find that utility plan anymore. It may have been deleted."],
    [422, "Something in there isn't right. Check the fields and try again."],
    [500, "I couldn't save that. Want to try again?"],
    ["offline", "I can't reach the server, so I couldn't save that. Your changes are still here."],
  ] as const)("keeps the typing and shows fixed copy for %s", async (write, copy) => {
    startUtilityServer({ detail: aUtilityPlanDetail(), write });
    await show(<UtilityPlanEditScreen id="u1" />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MESSAGES.provider}`)), "Direct Energy");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saveEdit }));
    expect(await screen.findByText(copy)).toBeTruthy();
    expect(screen.queryByText(/raw server text/)).toBeNull();
    expect(screen.getByLabelText(new RegExp(`^${MESSAGES.provider}`)).props.value).toBe("Direct Energy");
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe("the plan screen's actions", () => {
  it("gives a viewer no way to change or remove the plan", async () => {
    startUtilityServer({ role: "viewer", detail: aUtilityPlanDetail() });
    await show(<UtilityPlanDetailScreen id="u1" />);
    await screen.findByText("Oak Street · Electricity");
    expect(screen.queryByRole("button", { name: UTILITY_PLAN_MESSAGES.edit })).toBeNull();
    expect(screen.queryByRole("button", { name: UTILITY_PLAN_MESSAGES.remove })).toBeNull();
  });

  it("opens the editor for a writer", async () => {
    startUtilityServer({ detail: aUtilityPlanDetail() });
    await show(<UtilityPlanDetailScreen id="u1" />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_PLAN_MESSAGES.edit }));
    expect(mockPush).toHaveBeenCalledWith("/utility-plans/u1/edit");
  });

  it("asks before removing, then removes and leaves", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const server = startUtilityServer({ detail: aUtilityPlanDetail() });
    await show(<UtilityPlanDetailScreen id="u1" />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_PLAN_MESSAGES.remove }));
    expect(writesTo(server, "delete")).toHaveLength(0);
    const buttons = alert.mock.calls[0][2] ?? [];
    await buttons.find((button) => button.text === "Remove")?.onPress?.();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesTo(server, "delete")[0].url).toBe("/utility-plans/u1");
    expect(await screen.findByText(UTILITY_PLAN_MESSAGES.removed)).toBeTruthy();
  });

  it("treats a plan that was already removed as removed", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    startUtilityServer({ detail: aUtilityPlanDetail(), write: 404 });
    await show(<UtilityPlanDetailScreen id="u1" />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_PLAN_MESSAGES.remove }));
    await (alert.mock.calls[0][2] ?? []).find((button) => button.text === "Remove")?.onPress?.();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(await screen.findByText(UTILITY_PLAN_MESSAGES.alreadyRemoved)).toBeTruthy();
  });

  it("keeps the plan and shows fixed copy when removing fails", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    startUtilityServer({ detail: aUtilityPlanDetail(), write: 500 });
    await show(<UtilityPlanDetailScreen id="u1" />);
    await fireEvent.press(await screen.findByRole("button", { name: UTILITY_PLAN_MESSAGES.remove }));
    await (alert.mock.calls[0][2] ?? []).find((button) => button.text === "Remove")?.onPress?.();
    expect(await screen.findByText("I couldn't delete that utility plan. Want to try again?")).toBeTruthy();
    expect(screen.queryByText(/raw server text/)).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
