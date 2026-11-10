import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import { TAX_FORM_MESSAGES as MESSAGES } from "../src/constants/taxForm";
import TaxFormScreen from "../src/features/taxReturns/TaxFormScreen";
import { useIsAdmin } from "../src/features/workspace/useIsAdmin";
import { store } from "../src/lib/store";
import { aTaxField, aTaxForm, aTaxInstance } from "../test-support/aTaxForm";
import { startTaxServer, type TaxAnswer } from "../test-support/taxReturnsServer";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: (path: string) => mockPush(path) } }));
jest.mock("../src/features/workspace/useIsAdmin", () => ({ useIsAdmin: jest.fn() }));

const originalAdapter = api.defaults.adapter;

function serve(answer: TaxAnswer | (() => TaxAnswer)) {
  return startTaxServer(() => (typeof answer === "function" ? answer() : answer));
}

async function show(): Promise<void> {
  await render(
    <Provider store={store}>
      <TaxFormScreen formName="schedule_e" returnId="r1" />
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockPush.mockReset();
  jest.mocked(useIsAdmin).mockReturnValue(true);
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("TaxFormScreen", () => {
  it("asks for the form's fields and shows each with its value, where it came from and how its check came out", async () => {
    const server = serve({ data: aTaxForm([aTaxInstance({ fields: [aTaxField({ validation_status: "warning", validation_message: "Looks low" })] })]) });
    await show();
    expect(await screen.findByText("Rents received")).toBeTruthy();
    expect(server.calls[0].url).toBe("/tax-returns/r1/forms/schedule_e");
    expect(screen.getByText("$24,000.00")).toBeTruthy();
    expect(screen.getByText(`Worked out by me · Worth a look`)).toBeTruthy();
    expect(screen.getByText("Looks low")).toBeTruthy();
  });

  it("names each copy of the form and says whether a value was calculated or overridden", async () => {
    serve({
      data: aTaxForm([
        aTaxInstance({ fields: [aTaxField({ is_calculated: true }), aTaxField({ id: "f2", label: "Insurance", is_overridden: true, value: 90 })] }),
        aTaxInstance({ instance_id: "i2", instance_label: "9 Oak Ave", fields: [aTaxField({ id: "f3", label: "Repairs" })] }),
      ]),
    });
    await show();
    expect(await screen.findByText("123 Main St")).toBeTruthy();
    expect(screen.getByText("9 Oak Ave")).toBeTruthy();
    expect(screen.getByText(`${MESSAGES.calculated} · Checks out`)).toBeTruthy();
    expect(screen.getByText(`${MESSAGES.overridden} · Checks out`)).toBeTruthy();
  });

  it("titles a copy with no label and no issuer by the form's own name", async () => {
    serve({ data: aTaxForm([aTaxInstance({ instance_label: null, issuer_name: null })]) });
    await show();
    expect(await screen.findByText("Schedule E")).toBeTruthy();
  });

  it("masks identifying numbers", async () => {
    serve({ data: aTaxForm([aTaxInstance({ fields: [aTaxField({ field_id: "ssn", label: "SSN", type: "text", value: "123-45-6789" })] })]) });
    await show();
    expect(await screen.findByText("***6789")).toBeTruthy();
    expect(screen.queryByText(/123-45/)).toBeNull();
  });

  it("opens the document a copy was read from", async () => {
    serve({ data: aTaxForm([aTaxInstance({ source_type: "extracted", document_id: "d9" })]) });
    await show();
    await fireEvent.press(await screen.findByText(MESSAGES.viewSource));
    expect(mockPush).toHaveBeenCalledWith("/documents/d9");
  });

  it("lets an owner or admin open a field to override it", async () => {
    serve({ data: aTaxForm() });
    await show();
    await fireEvent.press(await screen.findByLabelText(new RegExp("^Rents received")));
    expect(mockPush).toHaveBeenCalledWith("/tax-returns/r1/override?form=schedule_e&field=f1");
  });

  it("shows anyone else the values, read-only, and says why", async () => {
    jest.mocked(useIsAdmin).mockReturnValue(false);
    serve({ data: aTaxForm() });
    await show();
    await screen.findByText("Rents received");
    expect(screen.getByText(MESSAGES.readOnlyNote)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Rents received/ })).toBeNull();
  });

  it("calls a form with no copies empty, which is not the same as one that failed", async () => {
    serve({ data: aTaxForm([]) });
    await show();
    expect(await screen.findByText(MESSAGES.noneHeading)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.couldntLoad)).toBeNull();
  });

  it("shows a skeleton while loading, never the empty state", async () => {
    api.defaults.adapter = () => new Promise(() => undefined);
    await show();
    expect(await screen.findByTestId("tax-form-skeleton")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
  });

  it("says a form is gone when the server has no such form, with nothing to retry", async () => {
    serve({ status: 404 });
    await show();
    expect(await screen.findByText(MESSAGES.couldntFind)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.tryAgain)).toBeNull();
  });

  it("offers a retry when it failed to load, and shows the form once it works", async () => {
    let status = 500;
    serve(() => (status === 200 ? { data: aTaxForm() } : { status }));
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noneHeading)).toBeNull();
    status = 200;
    await fireEvent.press(screen.getByText(MESSAGES.tryAgain));
    expect(await screen.findByText("Rents received")).toBeTruthy();
  });

  it("keeps the fields on screen and says they may be old when a refresh fails", async () => {
    let failing = false;
    serve(() => (failing ? { status: 500 } : { data: aTaxForm() }));
    await show();
    await screen.findByText("Rents received");
    failing = true;
    const { refreshControl } = screen.getByTestId("tax-form-list").props;
    await act(async () => {
      await refreshControl.props.onRefresh();
    });
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("Rents received")).toBeTruthy();
  });
});
