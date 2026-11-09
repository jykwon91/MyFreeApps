import { leaseTemplatesApi } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import type { MergedPlaceholder } from "@mybookkeeper/api-client/types/lease/merged-placeholder";
import type { LeasePlaceholderInputType } from "@mybookkeeper/api-client/types/lease/lease-placeholder-input-type";
import type { PlaceholderProvenance } from "@mybookkeeper/api-client/types/lease/placeholder-provenance";
import { localToday } from "@mybookkeeper/api-client/utils/localToday";
import api from "@platform/core/lib/api";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Alert, type AlertButton, Text } from "react-native";
import { Provider } from "react-redux";
import { NEW_LEASE_MESSAGES as MESSAGES } from "../src/constants/newLease";
import ApplicantPickerScreen from "../src/features/newLease/ApplicantPickerScreen";
import { flowFromParams, nextPath, templatesPath } from "../src/features/newLease/newLeaseFlow";
import NewLeaseDetailsScreen from "../src/features/newLease/NewLeaseDetailsScreen";
import TemplatePickerScreen from "../src/features/newLease/TemplatePickerScreen";
import { PLACEHOLDER_PROBLEM_MESSAGES } from "../src/constants/placeholderProblems";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { makeStore, store } from "../src/lib/store";
import type { NewLeaseRouteParams } from "../src/types/NewLeaseRouteParams";
import { aLease } from "../test-support/aLease";
import { holdWrites } from "../test-support/holdWrites";

jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});

const originalAdapter = api.defaults.adapter;

function aField(key: string, overrides: { type?: LeasePlaceholderInputType; required?: boolean; value?: string | null; provenance?: PlaceholderProvenance; templates?: string[] } = {}): MergedPlaceholder {
  const { type = "text", required = false, value = null, provenance = null, templates = ["t1"] } = overrides;
  return {
    placeholder: {
      id: `p-${key}`,
      template_id: templates[0],
      key,
      display_label: key,
      input_type: type,
      required,
      default_source: null,
      computed_expr: null,
      display_order: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    template_ids: templates,
    value,
    provenance,
  };
}

function aTemplate(id: string, name: string) {
  return { id, user_id: "u1", organization_id: "w1", name, description: null, version: 1, file_count: 1, placeholder_count: 2, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
}

function anApplicantRow(id: string, legal_name: string, stage: string) {
  return { id, organization_id: "w1", user_id: "u1", inquiry_id: null, legal_name, employer_or_hospital: null, contract_start: null, contract_end: null, stage, created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z" };
}

type Failure = { status: number; detail?: unknown } | "offline";

interface FakeServer {
  templates: ReturnType<typeof aTemplate>[];
  applicants: ReturnType<typeof anApplicantRow>[];
  fields: MergedPlaceholder[];
  templatesFailure: Failure | null;
  leaseSentFailure: Failure | null;
  defaultsFailure: Failure | null;
  createFailure: Failure | null;
  parent: ReturnType<typeof aLease> | null;
  creates: AxiosRequestConfig[];
  defaultsReads: unknown[];
}

function startServer(overrides: Partial<FakeServer> = {}): FakeServer {
  const server: FakeServer = {
    templates: [aTemplate("t1", "Standard lease"), aTemplate("t2", "Pet addendum")],
    applicants: [anApplicantRow("a1", "Dana Reed", "approved"), anApplicantRow("a2", "Sam Lee", "lease_sent"), anApplicantRow("a3", "Pat Kim", "screening_passed")],
    fields: [aField("Tenant name", { required: true, value: "Dana Reed", provenance: "applicant" }), aField("Rent", { type: "number" })],
    templatesFailure: null,
    leaseSentFailure: null,
    defaultsFailure: null,
    createFailure: null,
    parent: null,
    creates: [],
    defaultsReads: [],
    ...overrides,
  };
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data: JSON.parse(JSON.stringify(data)), status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    const fail = (failure: Failure) =>
      failure === "offline" ? Promise.reject(Object.assign(new Error("Network Error"), { config })) : respond({ detail: failure.detail ?? "no" }, failure.status);
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: "owner" }]);
    if (config.url === "/lease-templates") {
      if (server.templatesFailure) return fail(server.templatesFailure);
      return respond({ items: server.templates, total: server.templates.length, has_more: false });
    }
    if (config.url === "/lease-templates/generate-defaults") {
      server.defaultsReads.push(JSON.parse(String(config.data)));
      if (server.defaultsFailure) return fail(server.defaultsFailure);
      return respond({ placeholders: server.fields });
    }
    if (config.url === "/applicants") {
      if (config.params?.stage === "lease_sent" && server.leaseSentFailure) return fail(server.leaseSentFailure);
      const items = server.applicants.filter((applicant) => applicant.stage === config.params?.stage);
      return respond({ items, total: items.length, has_more: false });
    }
    if (config.url?.startsWith("/applicants/")) {
      const applicant = server.applicants.find((row) => config.url === `/applicants/${row.id}`);
      return applicant ? respond(applicant) : respond({ detail: "no" }, 404);
    }
    if (config.url === "/signed-leases" && config.method === "post") {
      server.creates.push(config);
      if (server.createFailure) return fail(server.createFailure);
      return respond(aLease({ id: "new1", status: "draft", kind: "generated" }), 201);
    }
    if (server.parent && config.url === `/signed-leases/${server.parent.id}`) return respond(server.parent);
    return respond({ detail: "Not found" }, 404);
  };
  api.defaults.adapter = adapter;
  return server;
}

function Templates() {
  return <TemplatePickerScreen flow={flowFromParams(useLocalSearchParams<NewLeaseRouteParams>())} />;
}
function Applicants() {
  return <ApplicantPickerScreen flow={flowFromParams(useLocalSearchParams<NewLeaseRouteParams>())} />;
}
function Details() {
  return <NewLeaseDetailsScreen flow={flowFromParams(useLocalSearchParams<NewLeaseRouteParams>())} />;
}
function Lease() {
  return <Text>{`lease-${useLocalSearchParams<{ id: string }>().id}`}</Text>;
}

/** The real router and real screens, because how the flow ends depends on the stack. */
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
      "leases/new/index": Templates,
      "leases/new/applicant": Applicants,
      "leases/new/details": Details,
      "leases/[id]": Lease,
    },
    { initialUrl: "/" },
  );
  await act(async () => {
    router.push(path as `/${string}`);
  });
}

const openDetails = (flow = { templateIds: ["t1"], applicantId: "a1" } as Parameters<typeof nextPath>[0]) => openAt(nextPath(flow));
const pressCreate = async () => fireEvent.press(await screen.findByRole("button", { name: MESSAGES.createDraft }));
const sent = (config: AxiosRequestConfig) => JSON.parse(String(config.data));

const alert = jest.spyOn(Alert, "alert");
let testStore: ReturnType<typeof makeStore>;

function pressInAlert(text: string): void {
  const buttons = alert.mock.calls.at(-1)?.[2] as AlertButton[];
  buttons.find((button) => button.text === text)?.onPress?.();
}

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(workspaceChosen("w1"));
  // The router's tests run on a fake clock that's replaced each time, and a store update queued on the old one would never tell anyone.
  testStore = makeStore();
  testStore.dispatch(workspaceChosen("w1"));
  alert.mockReset();
  alert.mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("the whole way through", () => {
  it("keeps my pick order, asks who it's for, and comes back past the pickers", async () => {
    const server = startServer();
    await openAt(templatesPath());
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Pet addendum" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Standard lease" }));
    expect(screen.getByText("Selected #1")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Continue with 2 templates" }));

    await fireEvent.press(await screen.findByText("Sam Lee"));
    expect(await screen.findByDisplayValue("Dana Reed")).toBeTruthy();
    expect(server.defaultsReads).toEqual([{ template_ids: ["t2", "t1"], applicant_id: "a2", today: localToday() }]);

    await pressCreate();
    expect(await screen.findByText("lease-new1")).toBeTruthy();
    expect(sent(server.creates[0])).toEqual({ template_ids: ["t2", "t1"], applicant_id: "a2", values: { "Tenant name": "Dana Reed", Rent: "" } });
    expect(screen.getByText("I made the draft with 2 documents.")).toBeTruthy();

    await act(async () => {
      router.back();
    });
    expect(screen.getByText("start-screen")).toBeTruthy();
  });

  it("skips the question when it already knows who it's for", async () => {
    const server = startServer();
    await openAt(templatesPath({ applicantId: "a1" }));
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Standard lease" }));
    await fireEvent.press(screen.getByRole("button", { name: "Continue with 1 template" }));
    expect(await screen.findByText("For Dana Reed, from Standard lease")).toBeTruthy();
    expect(screen.queryByText(MESSAGES.whoFor)).toBeNull();
    await pressCreate();
    expect(await screen.findByText("lease-new1")).toBeTruthy();
    expect(screen.getByText("I made the draft.")).toBeTruthy();
    expect(sent(server.creates[0]).applicant_id).toBe("a1");
  });

  it("drops a template I unpick, and hides Continue when none are left", async () => {
    startServer();
    await openAt(templatesPath());
    const row = await screen.findByRole("checkbox", { name: "Standard lease" });
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    await fireEvent.press(row);
    await fireEvent.press(screen.getByRole("checkbox", { name: "Standard lease, Selected #1" }));
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });
});

describe("the pickers", () => {
  it("says so when there are no templates", async () => {
    startServer({ templates: [] });
    await openAt(templatesPath());
    expect(await screen.findByText(MESSAGES.noTemplatesHeading)).toBeTruthy();
  });

  it("doesn't call a failed template load an empty list", async () => {
    const server = startServer({ templatesFailure: "offline" });
    await openAt(templatesPath());
    expect(await screen.findByText(MESSAGES.couldntLoadTemplates)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.noTemplatesHeading)).toBeNull();
    server.templatesFailure = null;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByRole("checkbox", { name: "Standard lease" })).toBeTruthy();
  });

  it("only offers people who are ready for a lease", async () => {
    startServer();
    await openAt(nextPath({ templateIds: ["t1"] }));
    expect(await screen.findByText("Dana Reed")).toBeTruthy();
    expect(await screen.findByText("Sam Lee")).toBeTruthy();
    expect(screen.queryByText("Pat Kim")).toBeNull();
  });

  it("says when nobody's ready", async () => {
    startServer({ applicants: [] });
    await openAt(nextPath({ templateIds: ["t1"] }));
    expect(await screen.findByText(MESSAGES.noApplicantsHeading)).toBeTruthy();
  });

  it("won't show half the list when one of the two loads fails", async () => {
    startServer({ leaseSentFailure: { status: 500 } });
    await openAt(nextPath({ templateIds: ["t1"] }));
    expect(await screen.findByText(MESSAGES.couldntLoadApplicants)).toBeTruthy();
    expect(screen.queryByText("Dana Reed")).toBeNull();
  });
});

describe("what goes in the lease", () => {
  it("doesn't show a blank form when I can't load what's needed", async () => {
    const server = startServer({ defaultsFailure: "offline" });
    await openDetails();
    expect(await screen.findByText(MESSAGES.couldntLoadDetails)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.createDraft })).toBeNull();
    server.defaultsFailure = null;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByDisplayValue("Dana Reed")).toBeTruthy();
  });

  it("offers a way back when a template or the person is gone", async () => {
    startServer({ defaultsFailure: { status: 404 } });
    await openDetails();
    expect(await screen.findByText(MESSAGES.cantFindHeading)).toBeTruthy();
  });

  it("can still make a draft with nothing to fill in", async () => {
    const server = startServer({ fields: [] });
    await openDetails();
    expect(await screen.findByText(MESSAGES.nothingToFill)).toBeTruthy();
    await pressCreate();
    expect(await screen.findByText("lease-new1")).toBeTruthy();
    expect(sent(server.creates[0]).values).toEqual({});
  });

  it("says where a value came from, and when I've changed it", async () => {
    startServer();
    await openDetails();
    expect(await screen.findByText("From their application")).toBeTruthy();
    await fireEvent.changeText(screen.getByDisplayValue("Dana Reed"), "Dana R. Reed");
    expect(screen.getByText("Edited by you")).toBeTruthy();
  });

  it("names the templates sharing a field", async () => {
    startServer({ fields: [aField("Rent", { templates: ["t1", "t2"] })] });
    await openDetails({ templateIds: ["t1", "t2"], applicantId: "a1" });
    expect(await screen.findByText("Used in Standard lease, Pet addendum")).toBeTruthy();
  });

  it("uses the keyboard that fits the field", async () => {
    startServer({ fields: [aField("Email", { type: "email" }), aField("Phone", { type: "phone" }), aField("Rent", { type: "number" })] });
    await openDetails();
    expect((await screen.findByLabelText("Email")).props.keyboardType).toBe("email-address");
    expect(screen.getByLabelText("Email").props.autoCapitalize).toBe("none");
    expect(screen.getByLabelText("Phone").props.keyboardType).toBe("phone-pad");
    expect(screen.getByLabelText("Rent").props.keyboardType).toBe("decimal-pad");
  });

  it("picks dates as dates and sends them the way the server reads them", async () => {
    const server = startServer({ fields: [aField("MOVE-IN DATE", { type: "date", value: "2027-01-15", provenance: "inquiry" })] });
    await openDetails();
    expect(await screen.findByRole("button", { name: "Change move-in date" })).toBeTruthy();
    await pressCreate();
    await screen.findByText("lease-new1");
    expect(sent(server.creates[0]).values).toEqual({ "MOVE-IN DATE": "2027-01-15" });
  });

  it("keeps my edits when the pulled values reload, until I ask to reset", async () => {
    const server = startServer();
    await openDetails();
    await fireEvent.changeText(await screen.findByDisplayValue("Dana Reed"), "Mine");
    server.fields = [aField("Tenant name", { required: true, value: "Pulled again", provenance: "applicant" })];
    await act(async () => {
      await testStore.dispatch(leaseTemplatesApi.endpoints.getMultiGenerateDefaults.initiate({ template_ids: ["t1"], applicant_id: "a1" }, { forceRefetch: true }));
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByDisplayValue("Mine")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.reset }));
    expect(screen.getByDisplayValue("Mine")).toBeTruthy();
    await act(async () => pressInAlert(MESSAGES.resetConfirm));
    expect(screen.getByDisplayValue("Pulled again")).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.reset })).toBeNull();
  });

  it("points at what's missing and sends nothing", async () => {
    const server = startServer();
    await openDetails();
    await fireEvent.changeText(await screen.findByDisplayValue("Dana Reed"), "   ");
    await pressCreate();
    expect(screen.getByText(PLACEHOLDER_PROBLEM_MESSAGES.required)).toBeTruthy();
    expect(screen.getByText(MESSAGES.needMoreAnswers)).toBeTruthy();
    expect(server.creates).toHaveLength(0);
  });

  it("marks a required date as missing too", async () => {
    const server = startServer({ fields: [aField("Start", { type: "date", required: true })] });
    await openDetails();
    await pressCreate();
    expect(screen.getByText(PLACEHOLDER_PROBLEM_MESSAGES.required)).toBeTruthy();
    expect(server.creates).toHaveLength(0);
  });

  it("flags a number it can't read on that field, instead of sending it as nothing", async () => {
    const server = startServer({ fields: [aField("Rent", { type: "number", value: "1,500.50" }), aField("Deposit", { type: "number" })] });
    await openDetails();
    await fireEvent.changeText(await screen.findByLabelText("Deposit"), "one thousand");
    await pressCreate();
    expect(screen.getAllByText(PLACEHOLDER_PROBLEM_MESSAGES.not_a_number)).toHaveLength(1);
    expect(screen.getByText(MESSAGES.needMoreAnswers)).toBeTruthy();
    expect(server.creates).toHaveLength(0);

    await fireEvent.changeText(screen.getByLabelText("Deposit"), "$1,000");
    await pressCreate();
    await screen.findByText("lease-new1");
    expect(sent(server.creates[0]).values).toEqual({ Rent: "1,500.50", Deposit: "$1,000" });
  });

  it("doesn't ask for what is worked out when the files are made, and says so", async () => {
    const server = startServer({ fields: [aField("Rent", { type: "number", value: "1500" }), aField("Total", { type: "computed" }), aField("Landlord signature", { type: "signature" })] });
    await openDetails();
    await screen.findByLabelText("Rent");
    expect(screen.queryByLabelText("Total")).toBeNull();
    expect(screen.queryByLabelText("Landlord signature")).toBeNull();
    expect(screen.getByText(`${MESSAGES.workedOut} Total`)).toBeTruthy();
    await pressCreate();
    await screen.findByText("lease-new1");
    expect(sent(server.creates[0]).values).toEqual({ Rent: "1500" });
  });
});

describe("leaving", () => {
  it("leaves freely when I haven't changed anything", async () => {
    startServer();
    await openDetails();
    await screen.findByDisplayValue("Dana Reed");
    await act(async () => {
      router.back();
    });
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText("start-screen")).toBeTruthy();
  });

  it("asks before throwing away my edits, and really leaves on Discard", async () => {
    startServer();
    await openDetails();
    await fireEvent.changeText(await screen.findByDisplayValue("Dana Reed"), "Mine");
    await act(async () => {
      router.back();
    });
    expect(alert.mock.calls[0][0]).toBe(MESSAGES.discardTitle);
    expect(screen.getByDisplayValue("Mine")).toBeTruthy();
    await act(async () => pressInAlert(MESSAGES.discard));
    expect(screen.getByText("start-screen")).toBeTruthy();
  });

  it("doesn't offer Discard while a draft is on its way", async () => {
    startServer();
    await openDetails();
    await screen.findByDisplayValue("Dana Reed");
    holdWrites();
    await pressCreate();
    await act(async () => {
      router.back();
    });
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Dana Reed")).toBeTruthy();
  });
});

describe("when creating fails", () => {
  it("makes one draft however many times I tap", async () => {
    const server = startServer();
    await openDetails();
    await screen.findByDisplayValue("Dana Reed");
    const button = screen.getByRole("button", { name: MESSAGES.createDraft });
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    await screen.findByText("lease-new1");
    expect(server.creates).toHaveLength(1);
  });

  it.each(["offline", { status: 502 }] as const)("tells me it isn't sure after %j, keeps my edits, and doesn't retry by itself", async (failure) => {
    const server = startServer({ createFailure: failure });
    await openDetails();
    await fireEvent.changeText(await screen.findByDisplayValue("Dana Reed"), "Mine");
    await pressCreate();
    expect(await screen.findByText(MESSAGES.unsure)).toBeTruthy();
    expect(screen.getByDisplayValue("Mine")).toBeTruthy();
    expect(server.creates).toHaveLength(1);
  });

  it.each([
    [{ status: 403 }, "You have view-only access."],
    [{ status: 404, detail: "Template not found" }, MESSAGES.notFound],
    [{ status: 429 }, MESSAGES.refused],
    [{ status: 422, detail: { code: "INVALID_PARENT_LEASE", message: "dev words" } }, MESSAGES.invalidParent],
  ])("explains %j in plain words", async (failure, message) => {
    startServer({ createFailure: failure });
    await openDetails({ templateIds: ["t1"], applicantId: "a1", parentLeaseId: "l0" });
    await screen.findByDisplayValue("Dana Reed");
    await pressCreate();
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("dev words")).toBeNull();
  });
});

it("pulls the fields again when a template changed after they loaded", async () => {
  const server = startServer({ createFailure: { status: 422, detail: "Missing required values: Pets" } });
  await openDetails();
  await screen.findByDisplayValue("Dana Reed");
  server.fields = [...server.fields, aField("Pets", { required: true })];
  await pressCreate();
  expect(await screen.findByText(MESSAGES.changedSince)).toBeTruthy();
  expect(await screen.findByText(PLACEHOLDER_PROBLEM_MESSAGES.required)).toBeTruthy();
  expect(server.defaultsReads).toHaveLength(2);
});

describe("following an earlier lease", () => {
  const parentFlow = { templateIds: ["t1"], applicantId: "a1", parentLeaseId: "l0" };

  it("says what it's doing and links the new lease to the earlier one", async () => {
    const server = startServer();
    await openDetails(parentFlow);
    expect(await screen.findByText(MESSAGES.followsEarlier)).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.seeEarlier })).toBeTruthy();
    await pressCreate();
    await screen.findByText("lease-new1");
    expect(sent(server.creates[0]).parent_lease_id).toBe("l0");
  });

  it("opens the newer lease when one already exists, which is also how a lost answer lands", async () => {
    startServer({
      createFailure: { status: 409, detail: { code: "SUCCESSOR_ALREADY_EXISTS", message: "dev words" } },
      parent: aLease({ id: "l0", successor_lease_id: "l9" }),
    });
    await openDetails(parentFlow);
    await screen.findByDisplayValue("Dana Reed");
    await pressCreate();
    expect(await screen.findByText("lease-l9")).toBeTruthy();
    expect(screen.getByText(MESSAGES.newerExists)).toBeTruthy();
    await act(async () => {
      router.back();
    });
    expect(screen.getByText("start-screen")).toBeTruthy();
  });

  it("stays put with an explanation if it can't find the newer lease", async () => {
    startServer({ createFailure: { status: 409, detail: { code: "SUCCESSOR_ALREADY_EXISTS" } } });
    await openDetails(parentFlow);
    await screen.findByDisplayValue("Dana Reed");
    await pressCreate();
    await waitFor(() => expect(screen.getByText(MESSAGES.newerExistsNotFound)).toBeTruthy());
  });
});
