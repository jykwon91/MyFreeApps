import { TAX_FIELD_OVERRIDE_PROBLEMS } from "@mybookkeeper/api-client/constants/taxFieldOverride";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { TAX_FIELD_OVERRIDE_MESSAGES as MESSAGES } from "../src/constants/taxFieldOverride";
import TaxFieldOverrideScreen from "../src/features/taxReturns/TaxFieldOverrideScreen";
import { useIsAdmin } from "../src/features/workspace/useIsAdmin";
import { store } from "../src/lib/store";
import { aTaxField, aTaxForm, aTaxInstance } from "../test-support/aTaxForm";
import { startTaxServer, type TaxAnswer, type TaxCall, writesOnly } from "../test-support/taxReturnsServer";

const mockBack = jest.fn();
const mockPreventRemove = { active: false };
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { back: () => mockBack(), canGoBack: () => true, replace: jest.fn() },
  usePreventRemove: (active: boolean) => {
    mockPreventRemove.active = active;
  },
}));
jest.mock("../src/features/workspace/useIsAdmin", () => ({ useIsAdmin: jest.fn() }));

const originalAdapter = api.defaults.adapter;

function serve(field = aTaxField(), onWrite?: (call: TaxCall) => TaxAnswer | Promise<TaxAnswer>) {
  return startTaxServer((call) => (call.method === "get" ? { data: aTaxForm([aTaxInstance({ fields: [field] })]) } : onWrite?.(call)));
}

async function show(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <TaxFieldOverrideScreen fieldRowId="f1" formName="schedule_e" returnId="r1" />
      </ToastProvider>
    </Provider>,
  );
}

const value = () => screen.getByLabelText(new RegExp(`^${MESSAGES.valueLabel}`));
const reason = () => screen.getByLabelText(new RegExp(`^${MESSAGES.reasonLabel}`));
const save = () => screen.getByRole("button", { name: MESSAGES.save });

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  jest.clearAllMocks();
  mockPreventRemove.active = false;
  jest.mocked(useIsAdmin).mockReturnValue(true);
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("TaxFieldOverrideScreen", () => {
  it("opens on the field's current value", async () => {
    serve();
    await show();
    await screen.findByText("Rents received");
    expect(value().props.value).toBe("24000");
    expect(screen.getByText(`${MESSAGES.currentValue}: $24,000.00`)).toBeTruthy();
  });

  it("starts an identifying number empty, never from its hidden form, and refuses to send a hidden value", async () => {
    const server = serve(aTaxField({ field_id: "recipient_tin", type: "text", value: "12-3456789", label: "Recipient TIN" }));
    await show();
    await screen.findByText("Recipient TIN");
    expect(value().props.value).toBe("");
    await fireEvent.changeText(value(), "***6789");
    await fireEvent.changeText(reason(), "Typo");
    await fireEvent.press(save());
    expect(await screen.findByText(TAX_FIELD_OVERRIDE_PROBLEMS.masked)).toBeTruthy();
    expect(writesOnly(server.calls)).toHaveLength(0);
  });

  it("won't save a blank text value as if it were typed; clearing is its own button", async () => {
    const server = serve(aTaxField({ type: "text", value: "Acme", label: "Employer" }));
    await show();
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MESSAGES.valueLabel}`)), "  ");
    await fireEvent.changeText(reason(), "Typo");
    await fireEvent.press(save());
    expect(await screen.findByText(TAX_FIELD_OVERRIDE_PROBLEMS.blank)).toBeTruthy();
    expect(writesOnly(server.calls)).toHaveLength(0);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.clear }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesOnly(server.calls)[0].data).toEqual({ value_text: null, override_reason: "Typo" });
  });

  it("shows Clear as the busy one while clearing, and Save as idle", async () => {
    let answer = (): void => undefined;
    const gate = new Promise<void>((resolve) => (answer = resolve));
    serve(aTaxField(), async () => {
      await gate;
      return {};
    });
    await show();
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MESSAGES.reasonLabel}`)), "Not applicable");
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.clear }));
    expect(await screen.findByText(MESSAGES.clearing)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.saving)).toBeNull();
    answer();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it("sends a number as a number, with the trimmed reason, then says it saved and leaves", async () => {
    const server = serve();
    await show();
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MESSAGES.valueLabel}`)), "$1,250.50");
    await fireEvent.changeText(reason(), "  Per the closing statement ");
    await fireEvent.press(save());
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const [write] = writesOnly(server.calls);
    expect(write).toMatchObject({ method: "patch", url: "/tax-returns/r1/fields/f1", data: { value_numeric: 1250.5, override_reason: "Per the closing statement" } });
    expect(await screen.findByText(MESSAGES.saved)).toBeTruthy();
  });

  it("sends text in the text column", async () => {
    const server = serve(aTaxField({ type: "text", value: "Acme", label: "Employer" }));
    await show();
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MESSAGES.valueLabel}`)), "Acme Inc");
    await fireEvent.changeText(reason(), "Typo");
    await fireEvent.press(save());
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesOnly(server.calls)[0].data).toEqual({ value_text: "Acme Inc", override_reason: "Typo" });
  });

  it("sends a yes or no for a yes or no field", async () => {
    const server = serve(aTaxField({ type: "boolean", value: false, label: "Qualified business" }));
    await show();
    await fireEvent.press(await screen.findByRole("tab", { name: MESSAGES.yes }));
    await fireEvent.changeText(reason(), "Confirmed");
    await fireEvent.press(save());
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesOnly(server.calls)[0].data).toEqual({ value_boolean: true, override_reason: "Confirmed" });
  });

  it.each(["abc", "12abc", "1,2,3", "", "--5", "1.2.3"])("points at an unreadable number %p on its own field and sends nothing", async (text) => {
    const server = serve();
    await show();
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MESSAGES.valueLabel}`)), text);
    await fireEvent.changeText(reason(), "Because");
    await fireEvent.press(save());
    expect(await screen.findByText(TAX_FIELD_OVERRIDE_PROBLEMS.number)).toBeTruthy();
    expect(screen.queryByText(TAX_FIELD_OVERRIDE_PROBLEMS.reason)).toBeNull();
    expect(writesOnly(server.calls)).toHaveLength(0);
  });

  it("asks for a reason before sending anything", async () => {
    const server = serve();
    await show();
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MESSAGES.valueLabel}`)), "5");
    await fireEvent.changeText(reason(), "   ");
    await fireEvent.press(save());
    expect(await screen.findByText(TAX_FIELD_OVERRIDE_PROBLEMS.reason)).toBeTruthy();
    expect(writesOnly(server.calls)).toHaveLength(0);
  });

  it("clears a value only on purpose, with a reason", async () => {
    const server = serve();
    await show();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.clear }));
    expect(await screen.findByText(TAX_FIELD_OVERRIDE_PROBLEMS.reason)).toBeTruthy();
    expect(writesOnly(server.calls)).toHaveLength(0);
    await fireEvent.changeText(reason(), "Not applicable");
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.clear }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesOnly(server.calls)[0].data).toEqual({ value_numeric: null, override_reason: "Not applicable" });
  });

  it("offers no clear for a value that is already empty or a yes or no", async () => {
    serve(aTaxField({ value: null }));
    await show();
    await screen.findByText("Rents received");
    expect(screen.queryByRole("button", { name: MESSAGES.clear })).toBeNull();
  });

  it("only sends once on a double press, and locks the form while saving", async () => {
    let answer = (): void => undefined;
    const gate = new Promise<void>((resolve) => (answer = resolve));
    const server = serve(aTaxField(), async () => {
      await gate;
      return {};
    });
    await show();
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MESSAGES.valueLabel}`)), "5");
    await fireEvent.changeText(reason(), "Because");
    await fireEvent.press(save());
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saving }));
    expect(screen.getByText(MESSAGES.saving)).toBeTruthy();
    expect(value().props.editable).toBe(false);
    answer();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(writesOnly(server.calls)).toHaveLength(1);
  });

  it("shows the server's own reason for a 422 and keeps the form open", async () => {
    serve(aTaxField(), () => ({ status: 422, data: { detail: [{ msg: "Value error, recipient_tin is a masked value" }] } }));
    await show();
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MESSAGES.valueLabel}`)), "77");
    await fireEvent.changeText(reason(), "Because");
    await fireEvent.press(save());
    expect(await screen.findByText("recipient_tin is a masked value")).toBeTruthy();
    expect(value().props.value).toBe("77");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("stops a text value at the server's 500 characters and rejects a number over its limits", async () => {
    const server = serve(aTaxField({ type: "text", value: "Acme", label: "Employer" }));
    await show();
    expect(value().props.maxLength).toBe(500);
    await screen.findByText("Employer");
    expect(writesOnly(server.calls)).toHaveLength(0);
  });

  it.each(["12345678901", "1.234"])("points at the number %p that is over the server's limits and sends nothing", async (text) => {
    const server = serve();
    await show();
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MESSAGES.valueLabel}`)), text);
    await fireEvent.changeText(reason(), "Because");
    await fireEvent.press(save());
    expect(await screen.findByText(TAX_FIELD_OVERRIDE_PROBLEMS.number)).toBeTruthy();
    expect(writesOnly(server.calls)).toHaveLength(0);
  });

  it.each([
    [403, "You have view-only access, so I can't save this."],
    [404, "I can't find that value anymore. It may have been deleted."],
    [409, MESSAGES.saveFailed],
    [422, "Something in there isn't right. Check the fields and try again."],
    [500, "I couldn't save that. Want to try again?"],
  ] as const)("keeps what was typed and shows fixed copy for %s", async (status, copy) => {
    serve(aTaxField(), () => ({ status }));
    await show();
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(`^${MESSAGES.valueLabel}`)), "77");
    await fireEvent.changeText(reason(), "Because");
    await fireEvent.press(save());
    expect(await screen.findByText(copy)).toBeTruthy();
    expect(value().props.value).toBe("77");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("guards leaving once something changed, and not before", async () => {
    serve();
    await show();
    await screen.findByText("Rents received");
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(reason(), "x");
    expect(mockPreventRemove.active).toBe(true);
  });

  it("tells anyone but an owner or admin they can't override, without loading anything", async () => {
    jest.mocked(useIsAdmin).mockReturnValue(false);
    const server = serve();
    await show();
    expect(await screen.findByText(MESSAGES.viewOnlyHeading)).toBeTruthy();
    expect(screen.queryByLabelText(new RegExp(`^${MESSAGES.valueLabel}`))).toBeNull();
    expect(writesOnly(server.calls)).toHaveLength(0);
  });

  it("says a value is gone when the server has no such form, or the form has no such field", async () => {
    startTaxServer(() => ({ data: aTaxForm([aTaxInstance({ fields: [aTaxField({ id: "other" })] })]) }));
    await show();
    expect(await screen.findByText(MESSAGES.couldntFind)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.tryAgain)).toBeNull();
  });

  it("offers a retry when the field failed to load", async () => {
    startTaxServer(() => ({ status: 500 }));
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.getByText(MESSAGES.tryAgain)).toBeTruthy();
  });

  it("shows a skeleton while loading", async () => {
    api.defaults.adapter = () => new Promise(() => undefined);
    await show();
    expect(await screen.findByTestId("tax-override-skeleton")).toBeTruthy();
  });
});
