import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Alert, type AlertButton, Text } from "react-native";
import { Provider } from "react-redux";
import { LEASE_DOCUMENT_MESSAGES as MESSAGES } from "../src/constants/leaseDocuments";
import AddDocumentPickScreen from "../src/features/leases/AddDocumentPickScreen";
import AddDocumentValuesScreen from "../src/features/leases/AddDocumentValuesScreen";
import { addDocumentDetailsPath, addDocumentPath, templateIdsFromParam } from "../src/features/leases/addDocumentFlow";
import { PLACEHOLDER_PROBLEM_MESSAGES } from "../src/constants/placeholderProblems";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { makeStore } from "../src/lib/store";
import { aLease } from "../test-support/aLease";
import { holdWrites } from "../test-support/holdWrites";
import { aPrefillItem, type FakeLeaseWritesServer, lastRequest, roleKnown, startLeaseWritesServer } from "../test-support/leaseWritesServer";

jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const originalAdapter = api.defaults.adapter;
const alert = jest.spyOn(Alert, "alert");
let testStore: ReturnType<typeof makeStore>;

function Pick() {
  return <AddDocumentPickScreen leaseId={useLocalSearchParams<{ id: string }>().id} />;
}
function Values() {
  const { id, template_ids } = useLocalSearchParams<{ id: string; template_ids?: string }>();
  return <AddDocumentValuesScreen leaseId={id} templateIds={templateIdsFromParam(template_ids)} />;
}
function LeasePage() {
  return <Text>{`lease-page-${useLocalSearchParams<{ id: string }>().id}`}</Text>;
}

/** The real router and real screens, because where the flow ends depends on the stack. */
async function openAt(path: string): Promise<void> {
  await renderRouter(
    {
      _layout: () => (
        <Provider store={testStore}>
          <ToastProvider bottomOffset={0}>
            <Stack />
          </ToastProvider>
        </Provider>
      ),
      index: () => <Text>start-screen</Text>,
      "leases/[id]/index": LeasePage,
      "leases/[id]/add-document/index": Pick,
      "leases/[id]/add-document/details": Values,
    },
    { initialUrl: "/" },
  );
  await act(async () => {
    router.push("/leases/l1");
  });
  await act(async () => {
    router.push(path as `/${string}`);
  });
}

const openValues = (ids = ["t1"]) => openAt(addDocumentDetailsPath("l1", ids));
const make = async () => fireEvent.press(await screen.findByRole("button", { name: MESSAGES.make }));
const sent = (server: FakeLeaseWritesServer, method: string, urlEnd: string) => JSON.parse(String(lastRequest(server, method, urlEnd)?.data));

function pressInAlert(text: string): void {
  const buttons = alert.mock.calls.at(-1)?.[2] as AlertButton[];
  buttons.find((button) => button.text === text)?.onPress?.();
}

beforeEach(() => {
  session.tokenStore.set("token");
  testStore = makeStore();
  testStore.dispatch(workspaceChosen("w1"));
  alert.mockReset();
  alert.mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  testStore.dispatch(baseApi.util.resetApiState());
});

describe("the flow's paths", () => {
  it("keeps the picked templates in order", () => {
    expect(addDocumentPath("l1")).toBe("/leases/l1/add-document");
    expect(addDocumentDetailsPath("l1", ["b", "a"])).toBe("/leases/l1/add-document/details?template_ids=b,a");
    expect(templateIdsFromParam("b,a")).toEqual(["b", "a"]);
    expect(templateIdsFromParam(undefined)).toEqual([]);
  });
});

describe("picking which templates to make documents from", () => {
  it("lists the templates, keeps my pick order, and carries it to the next screen", async () => {
    const server = startLeaseWritesServer({ prefill: [aPrefillItem("Pet name")] });
    await openAt(addDocumentPath("l1"));
    expect(screen.queryByRole("button", { name: /^Continue with/ })).toBeNull();
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Pet addendum" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Standard lease" }));
    expect(screen.getByRole("checkbox", { name: "Pet addendum, Selected #1" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Continue with 2 templates" }));

    expect(await screen.findByLabelText("Pet name")).toBeTruthy();
    expect(sent(server, "post", "/template-prefill").template_ids).toEqual(["t2", "t1"]);
  });

  it("drops a template I unpick, and hides Continue when none are left", async () => {
    startLeaseWritesServer();
    await openAt(addDocumentPath("l1"));
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Pet addendum" }));
    expect(screen.getByRole("button", { name: "Continue with 1 template" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("checkbox", { name: /^Pet addendum/ }));
    expect(screen.queryByRole("button", { name: /^Continue with/ })).toBeNull();
  });

  it("says which templates are already on the lease, since picking one makes it again", async () => {
    startLeaseWritesServer({ lease: aLease({ templates: [{ id: "t2", name: "Pet addendum", version: 1, display_order: 0 }] }) });
    await openAt(addDocumentPath("l1"));
    await screen.findByRole("checkbox", { name: "Pet addendum" });
    expect(screen.getAllByText(MESSAGES.onThisLease)).toHaveLength(1);
  });

  it("says so when there are no templates", async () => {
    startLeaseWritesServer({ templates: [] });
    await openAt(addDocumentPath("l1"));
    expect(await screen.findByText(MESSAGES.noTemplatesHeading)).toBeTruthy();
  });

  it("doesn't call a failed load an empty list, and tries again", async () => {
    const server = startLeaseWritesServer();
    server.failures.templates = { status: 500 };
    await openAt(addDocumentPath("l1"));
    expect(await screen.findByText(MESSAGES.couldntLoadTemplates)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noTemplatesHeading)).toBeNull();
    delete server.failures.templates;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByRole("checkbox", { name: "Standard lease" })).toBeTruthy();
  });

  it("explains a lease that is gone", async () => {
    const server = startLeaseWritesServer();
    server.lease = { ...server.lease, id: "other" };
    await openAt(addDocumentPath("l1"));
    expect(await screen.findByText(MESSAGES.goneHeading)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.goBack }));
    expect(await screen.findByText("lease-page-l1")).toBeTruthy();
  });

  it("gives someone who can only read nothing to pick", async () => {
    const server = startLeaseWritesServer({ role: "viewer" });
    await openAt(addDocumentPath("l1"));
    await roleKnown(server);
    expect(await screen.findByText(MESSAGES.viewOnly)).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Standard lease" })).toBeNull();
  });
});

describe("for someone who can only read", () => {
  it("shows no form and never asks the server what the documents need", async () => {
    const server = startLeaseWritesServer({ role: "viewer", prefill: [aPrefillItem("Tenant name")] });
    await openValues();
    await roleKnown(server);
    expect(await screen.findByText(MESSAGES.viewOnly)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.make })).toBeNull();
    expect(lastRequest(server, "post", "/template-prefill")).toBeUndefined();
  });
});

describe("filling in what the documents need", () => {
  const items = [
    aPrefillItem("Tenant name", { required: true, value: "Dana Reed", provenance: "applicant" }),
    aPrefillItem("Pet name"),
    aPrefillItem("Rent", { input_type: "number", value: "1,500" }),
    aPrefillItem("Notes", { value: "Saved before", is_from_existing_values: true }),
    aPrefillItem("Landlord signature", { input_type: "signature" }),
  ];

  it("asks the server what's needed, and fills in what it can say where it came from", async () => {
    const server = startLeaseWritesServer({ prefill: items });
    await openValues(["t1", "t2"]);
    expect(await screen.findByDisplayValue("Dana Reed")).toBeTruthy();
    expect(sent(server, "post", "/template-prefill").template_ids).toEqual(["t1", "t2"]);
    expect(screen.getByText("From applicant")).toBeTruthy();
    expect(screen.getByText("Saved on lease")).toBeTruthy();
    expect(screen.queryByLabelText("Landlord signature")).toBeNull();
    expect(screen.getByLabelText("Rent").props.keyboardType).toBe("decimal-pad");
  });

  it("sends my values for the chosen templates, then goes back to the lease and says what it did", async () => {
    const server = startLeaseWritesServer({ prefill: items });
    await openValues(["t1", "t2"]);
    await fireEvent.changeText(await screen.findByLabelText("Pet name"), "  Rex ");
    await fireEvent.changeText(screen.getByLabelText("Rent"), "1600");
    await make();

    expect(await screen.findByText("lease-page-l1")).toBeTruthy();
    expect(await screen.findByText("I added the 2 documents.")).toBeTruthy();
    const body = sent(server, "post", "/signed-leases/l1/templates");
    expect(body.template_ids).toEqual(["t1", "t2"]);
    expect(body.values).toEqual({ "Tenant name": "Dana Reed", "Pet name": "Rex", Rent: "1600", Notes: "Saved before", "Landlord signature": "" });
    expect(screen.queryByText(MESSAGES.make)).toBeNull();
  });

  it("says it made a document again when it was already on the lease", async () => {
    startLeaseWritesServer({ prefill: [aPrefillItem("Tenant name", { value: "Dana" })], lease: aLease({ templates: [{ id: "t1", name: "Standard lease", version: 1, display_order: 0 }] }) });
    await openValues(["t1"]);
    await screen.findByDisplayValue("Dana");
    await make();
    expect(await screen.findByText("I made the document again.")).toBeTruthy();
  });

  it("can make documents with nothing to fill in", async () => {
    const server = startLeaseWritesServer({ prefill: [aPrefillItem("Landlord signature", { input_type: "signature" })] });
    await openValues();
    expect(await screen.findByText(MESSAGES.nothingToFill)).toBeTruthy();
    await make();
    await screen.findByText("lease-page-l1");
    expect(sent(server, "post", "/signed-leases/l1/templates").values).toEqual({ "Landlord signature": "" });
  });

  it("points at what's missing or unreadable on its own field, and sends nothing until it's right", async () => {
    const server = startLeaseWritesServer({ prefill: items });
    await openValues();
    await fireEvent.changeText(await screen.findByDisplayValue("Dana Reed"), "   ");
    await fireEvent.changeText(screen.getByLabelText("Rent"), "about 1600");
    await make();
    expect(screen.getByText(PLACEHOLDER_PROBLEM_MESSAGES.required)).toBeTruthy();
    expect(screen.getByText(PLACEHOLDER_PROBLEM_MESSAGES.not_a_number)).toBeTruthy();
    expect(lastRequest(server, "post", "/templates")).toBeUndefined();

    await fireEvent.changeText(screen.getByLabelText("Tenant name, required"), "Dana");
    await fireEvent.changeText(screen.getByLabelText("Rent"), "$1,600.50");
    await make();
    await screen.findByText("lease-page-l1");
    expect(sent(server, "post", "/signed-leases/l1/templates").values.Rent).toBe("$1,600.50");
  });

  it("doesn't mind a blank optional number", async () => {
    const server = startLeaseWritesServer({ prefill: [aPrefillItem("Deposit", { input_type: "number" })] });
    await openValues();
    await make();
    await screen.findByText("lease-page-l1");
    expect(sent(server, "post", "/signed-leases/l1/templates").values).toEqual({ Deposit: "" });
  });

  it("shows it's working and makes the documents once however many times it's tapped", async () => {
    const server = startLeaseWritesServer({ prefill: items });
    await openValues();
    await screen.findByDisplayValue("Dana Reed");
    holdWrites();
    await make();
    expect(screen.getByText(MESSAGES.making)).toBeTruthy();
    expect(screen.getByLabelText("Pet name").props.editable).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.making }));
    expect(server.requests.filter((request) => request.method === "post" && request.url?.endsWith("/templates"))).toHaveLength(0);
  });

  it.each([
    [{ status: 500 }, MESSAGES.unsure],
    ["offline" as const, MESSAGES.unsure],
    [{ status: 422 }, MESSAGES.refused],
    [{ status: 404 }, MESSAGES.gone],
    [{ status: 403 }, MESSAGES.viewOnly],
  ])("tells it in fixed words when making fails (%j) and keeps what I typed", async (failure, message) => {
    const server = startLeaseWritesServer({ prefill: items });
    server.failures.addTemplates = failure;
    await openValues();
    await fireEvent.changeText(await screen.findByLabelText("Pet name"), "Rex");
    await make();
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("A developer's message")).toBeNull();
    expect(screen.getByDisplayValue("Rex")).toBeTruthy();

    delete server.failures.addTemplates;
    await make();
    expect(await screen.findByText("lease-page-l1")).toBeTruthy();
  });

  it("doesn't show a blank form when it can't load what's needed, and tries again", async () => {
    const server = startLeaseWritesServer({ prefill: items });
    server.failures.prefill = { status: 500 };
    await openValues();
    expect(await screen.findByText(MESSAGES.couldntLoadFields)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.make })).toBeNull();
    delete server.failures.prefill;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByDisplayValue("Dana Reed")).toBeTruthy();
  });

  it("offers a way back when the lease or a template is gone", async () => {
    const server = startLeaseWritesServer();
    server.failures.prefill = { status: 404 };
    await openValues();
    expect(await screen.findByText(MESSAGES.goneHeading)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.goBack }));
    expect(await screen.findByText("lease-page-l1")).toBeTruthy();
  });

  it("shows a skeleton while it asks", async () => {
    startLeaseWritesServer({ prefill: items });
    holdWrites();
    await openValues();
    expect(await screen.findByLabelText(MESSAGES.loadingFields)).toBeTruthy();
  });

  it("blocks going back while the documents are being made, even if nothing was edited", async () => {
    const server = startLeaseWritesServer({ prefill: [aPrefillItem("Tenant name", { value: "Dana" })] });
    await openValues();
    await screen.findByDisplayValue("Dana");
    holdWrites();
    await make();
    expect(screen.getByText(MESSAGES.making)).toBeTruthy();
    await act(async () => {
      router.back();
    });
    expect(screen.queryByText("lease-page-l1")).toBeNull();
    expect(screen.getByText(MESSAGES.making)).toBeTruthy();
    expect(server.requests.filter((request) => request.url?.endsWith("/templates") && request.method === "post")).toHaveLength(0);
  });

  it("leaves freely when nothing was changed, and asks before throwing away my edits", async () => {
    startLeaseWritesServer({ prefill: items });
    await openValues();
    await screen.findByDisplayValue("Dana Reed");
    await act(async () => {
      router.back();
    });
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText("lease-page-l1")).toBeTruthy();

    await act(async () => {
      router.push(addDocumentDetailsPath("l1", ["t1"]) as `/${string}`);
    });
    await fireEvent.changeText(await screen.findByLabelText("Pet name"), "Rex");
    await act(async () => {
      router.back();
    });
    expect(alert.mock.calls[0][0]).toBe("Discard your changes?");
    expect(screen.getByDisplayValue("Rex")).toBeTruthy();
    await act(async () => pressInAlert("Discard"));
    expect(screen.getByText("lease-page-l1")).toBeTruthy();
  });
});
