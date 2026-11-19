import { baseApi } from "@platform/core/store/baseApi";
import api from "@platform/core/lib/api";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Provider } from "react-redux";
import LeaseApplicantField from "../src/features/leaseImport/LeaseApplicantField";
import TenantPickerSheet from "../src/features/tenants/TenantPickerSheet";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { anApplicant, startApplicantServer } from "../test-support/applicantsServer";

jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const originalAdapter = api.defaults.adapter;
const LOAD_FAILED = "I couldn't load more.";
const FIRST_PAGE = 25;

/** 26 people, "Person 00" to "Person 25", newest first, so "Person 25" is on the second page. */
function people(stage: "lease_signed" | "lead") {
  return Array.from({ length: FIRST_PAGE + 1 }, (_, index) =>
    anApplicant({ id: `p${index}`, legal_name: `Person ${String(index).padStart(2, "0")}`, stage, contract_end: null }),
  );
}

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

async function renderField(field: ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{field}</ToastProvider>
    </Provider>,
  );
}

/** The sheet's list: the nearest ancestor of its first option that holds the options. */
function sheetList(): ReturnType<typeof screen.getByRole> {
  let node: ReturnType<typeof screen.getByRole> | null = screen.getByRole("radio", { name: "Person 00" });
  while (node && !node.props.data) node = node.parent;
  return node!;
}
/**
 * Presses the sheet's row for `value`. The test renderer has no layout, so a virtualized list never renders rows
 * past its first screenful however far it is scrolled; this presses the row the sheet would render for it.
 */
async function pickOffered(value: string): Promise<void> {
  const option = (sheetList().props.data as { value: string; label: string }[]).find((candidate) => candidate.value === value);
  const row = sheetList().props.renderItem({ item: option, index: 0 }) as ReactElement<{ onPress: () => void }>;
  await act(async () => {
    row.props.onPress();
  });
}
const offered = () => (sheetList().props.data as { value: string }[]).map((option) => option.value);
const listOffsets = (server: ReturnType<typeof startApplicantServer>, url: string) =>
  server.requests.filter((request) => request.url === url).map((request) => (request.params as { offset: number }).offset);

describe("the tenant picker", () => {
  it("reaches a tenant past the first page on reaching the end of the sheet, and picks them", async () => {
    const server = startApplicantServer(people("lease_signed"));
    const onPick = jest.fn();
    await renderField(<TenantPickerSheet description="Who paid?" isOpen onClose={jest.fn()} onClosed={jest.fn()} onPick={onPick} />);
    await screen.findByRole("radio", { name: "Person 00" });
    expect(offered()).toHaveLength(FIRST_PAGE);
    expect(offered()).not.toContain("p25");

    await act(async () => {
      sheetList().props.onEndReached();
    });
    await waitFor(() => expect(offered()).toContain("p25"));
    await pickOffered("p25");

    expect(onPick).toHaveBeenCalledWith({ id: "p25", name: "Person 25" });
    expect(listOffsets(server, "/applicants/tenants")).toEqual([0, FIRST_PAGE]);
  });
});

describe("the lease import applicant picker", () => {
  async function openSheet() {
    await fireEvent.press(await screen.findByRole("button", { name: /^Who signed it\?/ }));
    await screen.findByRole("radio", { name: "Person 00" });
  }

  it("reaches an applicant past the first page on reaching the end of the sheet, and picks them", async () => {
    const server = startApplicantServer(people("lead"));
    const onChange = jest.fn();
    await renderField(<LeaseApplicantField disabled={false} onChange={onChange} value="" />);
    await openSheet();
    expect(offered()).not.toContain("p25");

    await act(async () => {
      sheetList().props.onEndReached();
    });
    await waitFor(() => expect(offered()).toContain("p25"));
    await pickOffered("p25");

    expect(onChange).toHaveBeenCalledWith("p25");
    expect(listOffsets(server, "/applicants")).toEqual([0, FIRST_PAGE]);
  });

  it("keeps the applicants it has when the next page fails, and loads it on Try again", async () => {
    const server = startApplicantServer(people("lead"));
    server.failListFromOffset = FIRST_PAGE;
    await renderField(<LeaseApplicantField disabled={false} onChange={jest.fn()} value="" />);
    await openSheet();

    await act(async () => {
      sheetList().props.onEndReached();
    });
    expect(await screen.findByText(LOAD_FAILED)).toBeTruthy();
    expect(offered()).toHaveLength(FIRST_PAGE);

    server.failListFromOffset = null;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(offered()).toContain("p25"));
    expect(screen.queryByText(LOAD_FAILED)).toBeNull();
  });
});
