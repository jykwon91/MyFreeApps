import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import type { ReactElement } from "react";
import { Provider } from "react-redux";
import AddDocumentPickList from "../src/features/leases/AddDocumentPickList";
import ApplicantPickerList from "../src/features/newLease/ApplicantPickerList";
import TemplatePickerList from "../src/features/newLease/TemplatePickerList";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aLease } from "../test-support/aLease";
import { anApplicant, startApplicantServer } from "../test-support/applicantsServer";
import { aServerTemplate, startLeaseTemplatesServer } from "../test-support/leaseTemplatesServer";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const originalAdapter = api.defaults.adapter;
const WEBSITE_LINK = "See them all on the website";
const LOAD_FAILED = "I couldn't load more.";

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

async function renderList(list: ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{list}</ToastProvider>
    </Provider>,
  );
}

const reachEnd = async (testID: string) => {
  await act(async () => {
    screen.getByTestId(testID).props.onEndReached();
  });
};

const rowIds = (testID: string) => (screen.getByTestId(testID).props.data as { id: string }[]).map((row) => row.id);

const templates = (count: number) => Array.from({ length: count }, (_, index) => aServerTemplate({ id: `t${index}`, name: `Template ${index}` }));

/** The templates fake, plus the one lease the add-document picker reads. */
function startTemplatesAndLease(count: number) {
  const server = startLeaseTemplatesServer(templates(count));
  const templatesAdapter = api.defaults.adapter as AxiosAdapter;
  api.defaults.adapter = (config) =>
    config.url === "/signed-leases/l1"
      ? Promise.resolve({ data: aLease(), status: 200, statusText: "", headers: {}, config })
      : templatesAdapter(config);
  return server;
}

describe("the new-lease applicant picker", () => {
  const ready = (count: number) => [
    ...Array.from({ length: count }, (_, index) => anApplicant({ id: `ap${index}`, legal_name: `Approved ${index}`, stage: "approved" })),
    ...Array.from({ length: count }, (_, index) => anApplicant({ id: `ls${index}`, legal_name: `Sent ${index}`, stage: "lease_sent" })),
  ];
  const list = <ApplicantPickerList flow={{ templateIds: ["t1"] }} />;

  it("loads the next page of both stages on reaching the end, with no website link", async () => {
    const server = startApplicantServer(ready(26));
    await renderList(list);
    await screen.findByText("Approved 0");
    expect(rowIds("applicant-picker-list")).toHaveLength(50);
    await reachEnd("applicant-picker-list");
    await waitFor(() => expect(rowIds("applicant-picker-list")).toHaveLength(52));
    expect(new Set(rowIds("applicant-picker-list")).size).toBe(52);
    expect(server.requests.filter((request) => (request.params as { offset?: number }).offset === 25)).toHaveLength(2);
    expect(screen.queryByText(WEBSITE_LINK)).toBeNull();
  });

  it("offers another go when the next page fails", async () => {
    const server = startApplicantServer(ready(26));
    server.failListFromOffset = 25;
    await renderList(list);
    await screen.findByText("Approved 0");
    await reachEnd("applicant-picker-list");
    expect(await screen.findByText(LOAD_FAILED)).toBeTruthy();
    expect(rowIds("applicant-picker-list")).toHaveLength(50);
    server.failListFromOffset = null;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(rowIds("applicant-picker-list")).toHaveLength(52));
    expect(screen.queryByText(LOAD_FAILED)).toBeNull();
  });
});

describe("the new-lease template picker", () => {
  const list = <TemplatePickerList flow={{ templateIds: [] }} />;

  it("loads the next page on reaching the end, with no website link", async () => {
    const server = startLeaseTemplatesServer(templates(26));
    await renderList(list);
    await screen.findByText("Template 0");
    expect(rowIds("template-picker-list")).toHaveLength(25);
    await reachEnd("template-picker-list");
    await waitFor(() => expect(rowIds("template-picker-list")).toHaveLength(26));
    expect(server.listReads).toBe(2);
    expect(screen.queryByText(WEBSITE_LINK)).toBeNull();
  });

  it("offers another go when the next page fails", async () => {
    const server = startLeaseTemplatesServer(templates(26));
    server.failListFromOffset = 25;
    await renderList(list);
    await screen.findByText("Template 0");
    await reachEnd("template-picker-list");
    expect(await screen.findByText(LOAD_FAILED)).toBeTruthy();
    server.failListFromOffset = null;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(rowIds("template-picker-list")).toHaveLength(26));
    expect(screen.queryByText(LOAD_FAILED)).toBeNull();
  });
});

describe("the add-document template picker", () => {
  const list = <AddDocumentPickList leaseId="l1" />;

  it("loads the next page on reaching the end, with no website link", async () => {
    const server = startTemplatesAndLease(26);
    await renderList(list);
    await screen.findByText("Template 0");
    expect(rowIds("add-document-template-list")).toHaveLength(25);
    await reachEnd("add-document-template-list");
    await waitFor(() => expect(rowIds("add-document-template-list")).toHaveLength(26));
    expect(server.listReads).toBe(2);
    expect(screen.queryByText(WEBSITE_LINK)).toBeNull();
  });

  it("offers another go when the next page fails", async () => {
    const server = startTemplatesAndLease(26);
    server.failListFromOffset = 25;
    await renderList(list);
    await screen.findByText("Template 0");
    await reachEnd("add-document-template-list");
    expect(await screen.findByText(LOAD_FAILED)).toBeTruthy();
    server.failListFromOffset = null;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(rowIds("add-document-template-list")).toHaveLength(26));
    expect(screen.queryByText(LOAD_FAILED)).toBeNull();
  });
});
