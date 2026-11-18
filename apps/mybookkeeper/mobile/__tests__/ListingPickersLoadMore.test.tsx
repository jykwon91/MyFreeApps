import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Provider } from "react-redux";
import InquiryListingField from "../src/features/inquiries/InquiryListingField";
import LeaseListingField from "../src/features/leaseImport/LeaseListingField";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { startPagedListingsServer } from "../test-support/pagedListingsServer";

jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const originalAdapter = api.defaults.adapter;
const LOAD_FAILED = "I couldn't load more.";
const FIRST_PAGE = 25;

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

describe("the new-inquiry listing picker", () => {
  it("reaches a listing past the first page with Show more listings", async () => {
    const server = startPagedListingsServer(26);
    const onChange = jest.fn();
    await renderField(<InquiryListingField disabled={false} onChange={onChange} value="" />);
    await screen.findByRole("radio", { name: "Room 24" });
    expect(screen.queryByRole("radio", { name: "Room 25" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Show more listings" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Room 25" }));

    expect(onChange).toHaveBeenCalledWith("li25");
    expect(server.offsets).toEqual([0, FIRST_PAGE]);
    expect(screen.queryByRole("button", { name: "Show more listings" })).toBeNull();
  });

  it("keeps the listings it has when the next page fails, and loads it on Try again", async () => {
    const server = startPagedListingsServer(26);
    server.failFromOffset = FIRST_PAGE;
    await renderField(<InquiryListingField disabled={false} onChange={jest.fn()} value="" />);
    await screen.findByRole("radio", { name: "Room 0" });

    await fireEvent.press(screen.getByRole("button", { name: "Show more listings" }));
    expect(await screen.findByText(LOAD_FAILED)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Room 24" })).toBeTruthy();

    server.failFromOffset = null;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("radio", { name: "Room 25" })).toBeTruthy();
    expect(screen.queryByText(LOAD_FAILED)).toBeNull();
  });
});

describe("the lease import listing picker", () => {
  /** The sheet's list: the nearest ancestor of its first option that holds the options. */
  function sheetList(): ReturnType<typeof screen.getByRole> {
    let node: ReturnType<typeof screen.getByRole> | null = screen.getByRole("radio", { name: "Room 5" });
    while (node && !node.props.data) node = node.parent;
    return node!;
  }
  const offered = () => (sheetList().props.data as { value: string }[]).map((option) => option.value);

  it("reaches a listing past the first page on reaching the end of the sheet", async () => {
    const server = startPagedListingsServer(26);
    await renderField(<LeaseListingField disabled={false} onChange={jest.fn()} value="" />);
    await fireEvent.press(await screen.findByRole("button", { name: /^Listing/ }));
    await screen.findByRole("radio", { name: "Room 5" });
    expect(offered()).toHaveLength(FIRST_PAGE + 1);
    expect(offered()).not.toContain("li25");

    await act(async () => {
      sheetList().props.onEndReached();
    });

    await waitFor(() => expect(offered()).toContain("li25"));
    expect(offered()).toHaveLength(FIRST_PAGE + 2);
    expect(server.offsets).toEqual([0, FIRST_PAGE]);
  });

  it("offers another go when the next page fails", async () => {
    const server = startPagedListingsServer(26);
    server.failFromOffset = FIRST_PAGE;
    await renderField(<LeaseListingField disabled={false} onChange={jest.fn()} value="" />);
    await fireEvent.press(await screen.findByRole("button", { name: /^Listing/ }));
    await screen.findByRole("radio", { name: "Room 5" });

    await act(async () => {
      sheetList().props.onEndReached();
    });
    expect(await screen.findByText(LOAD_FAILED)).toBeTruthy();

    server.failFromOffset = null;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(offered()).toContain("li25"));
    expect(screen.queryByText(LOAD_FAILED)).toBeNull();
  });
});
