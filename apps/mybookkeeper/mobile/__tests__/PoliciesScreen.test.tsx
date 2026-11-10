import { insurancePoliciesApi } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import type { InsurancePolicyAttachment } from "@mybookkeeper/api-client/types/insurance/insurance-policy-attachment";
import type { InsurancePolicyDetail } from "@mybookkeeper/api-client/types/insurance/insurance-policy-detail";
import type { InsurancePolicySummary } from "@mybookkeeper/api-client/types/insurance/insurance-policy-summary";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { SHOWING_LAST_LOADED_MESSAGE, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Provider } from "react-redux";
import { INSURANCE_MESSAGES } from "../src/constants/insurance";
import { openAttachmentFile } from "../src/features/documents/openDocumentFile";
import PoliciesScreen from "../src/features/insurance/PoliciesScreen";
import { expiryLabel, policyTerm, sortedPolicies } from "../src/features/insurance/policyDisplay";
import PolicyDetailScreen from "../src/features/insurance/PolicyDetailScreen";
import { isoFromDate } from "../src/lib/localDate";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { store } from "../src/lib/store";
import { aInsurancePolicySummary } from "../test-support/aInsurancePolicySummary";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack() },
}));
jest.mock("../src/features/documents/openDocumentFile", () => ({ openAttachmentFile: jest.fn() }));

const originalAdapter = api.defaults.adapter;

function aFile(overrides: Partial<InsurancePolicyAttachment> = {}): InsurancePolicyAttachment {
  return {
    id: "f1",
    policy_id: "p1",
    filename: "declarations.pdf",
    storage_key: "k",
    content_type: "application/pdf",
    size_bytes: 10,
    kind: "policy_document",
    uploaded_by_user_id: "u1",
    uploaded_at: "2026-01-01T00:00:00Z",
    presigned_url: "https://files.example/old",
    is_available: true,
    ...overrides,
  };
}

function aPolicy(overrides: Partial<InsurancePolicyDetail> = {}): InsurancePolicyDetail {
  return {
    ...aInsurancePolicySummary(),
    user_id: "u1",
    organization_id: "o1",
    source_document_id: null,
    policy_number: "HO-123456",
    notes: "Agent is Dana",
    attachments: [aFile()],
    ...overrides,
  };
}

const NOTHING_TRACKED = {
  material_gap_pct: 10,
  benchmark: null,
  above_market: [],
  not_compared: [],
  total_above_market: 0,
  total_considered: 0,
  has_stale_benchmark: false,
};

type Answer = unknown | "fail" | "gone" | "hold";

function startServer(list: Answer, detail: Answer = aPolicy()) {
  const server = { list, detail };
  const adapter: AxiosAdapter = async (config) => {
    if (config.url === "/organizations") {
      return { data: [{ id: "w1", name: "Mine", org_role: "owner" }], status: 200, statusText: "OK", headers: {}, config };
    }
    if (config.url === "/insurance-policies/premium-comparison") {
      return { data: { ...NOTHING_TRACKED }, status: 200, statusText: "OK", headers: {}, config };
    }
    const answer = config.url === "/insurance-policies" ? server.list : server.detail;
    if (answer === "hold") return new Promise(() => undefined);
    if (answer === "fail") return Promise.reject({ response: { status: 500, data: {} }, config, isAxiosError: true });
    if (answer === "gone") return Promise.reject({ response: { status: 404, data: {} }, config, isAxiosError: true });
    return { data: answer, status: 200, statusText: "OK", headers: {}, config };
  };
  api.defaults.adapter = adapter;
  return server;
}

function aPage(items: InsurancePolicySummary[], hasMore = false) {
  return { items, total: items.length, has_more: hasMore };
}

async function show(element: React.ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  mockPush.mockClear();
  mockBack.mockClear();
  jest.mocked(openAttachmentFile).mockReset();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("expiryLabel", () => {
  const today = "2026-03-10";
  it.each([
    ["2026-03-01", "Expired 9 days ago"],
    ["2026-03-09", "Expired yesterday"],
    ["2026-03-10", "Expires today"],
    ["2026-03-11", "Expires tomorrow"],
    ["2026-03-19", "Expires in 9 days"],
    ["2026-06-08", "Expires in 90 days"],
    ["2026-06-09", null],
    [null, null],
  ])("%s reads %s", (date, label) => {
    expect(expiryLabel(date, today)).toBe(label);
  });

  it("counts whole days across a clock change", () => {
    expect(expiryLabel("2026-03-09", "2026-03-07")).toBe("Expires in 2 days");
  });
});

describe("sortedPolicies", () => {
  it("puts what runs out first on top, then no date, then the most recently expired", () => {
    const named = (policy_name: string, expiration_date: string | null) => aInsurancePolicySummary({ id: policy_name, policy_name, expiration_date });
    const sorted = sortedPolicies(
      [named("older expired", "2026-01-01"), named("no date", null), named("later", "2026-12-01"), named("recent expired", "2026-03-01"), named("soon", "2026-04-01"), named("today", "2026-03-10")],
      "2026-03-10",
    );
    expect(sorted.map((policy) => policy.policy_name)).toEqual(["today", "soon", "later", "no date", "recent expired", "older expired"]);
  });
});

describe("policyTerm", () => {
  it("says what it knows", () => {
    expect(policyTerm("2026-01-15", "2027-01-15")).toBe("Jan 15, 2026 to Jan 15, 2027");
    expect(policyTerm(null, "2027-01-15")).toBe("Ends Jan 15, 2027");
    expect(policyTerm("2026-01-15", null)).toBe("Starts Jan 15, 2026");
    expect(policyTerm(null, null)).toBeNull();
  });
});

describe("PoliciesScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer("hold");
    await show(<PoliciesScreen />);
    expect(await screen.findByTestId("policies-skeleton")).toBeTruthy();
  });

  it("opens a policy, and marks only one that's running out", async () => {
    const soon = isoFromDate(new Date(Date.now() + 10 * 86_400_000));
    startServer(aPage([aInsurancePolicySummary(), aInsurancePolicySummary({ id: "p2", policy_name: "Flood", expiration_date: soon })]));
    await show(<PoliciesScreen />);
    await screen.findByText("Flood");
    expect(screen.getAllByText(/^Expires in \d+ days$/)).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Landlord policy, Oak Street, Acme Mutual, $1,344/yr" }));
    expect(mockPush).toHaveBeenCalledWith("/insurance/p1");
  });

  it("says when there are more than it shows", async () => {
    startServer(aPage([aInsurancePolicySummary()], true));
    await show(<PoliciesScreen />);
    await screen.findByText(INSURANCE_MESSAGES.moreThanShown);
  });

  it("sends a writer with no policies to the add screen", async () => {
    startServer(aPage([]));
    await show(<PoliciesScreen />);
    await screen.findByText(INSURANCE_MESSAGES.noneHeading);
    await fireEvent.press(screen.getAllByRole("button", { name: INSURANCE_MESSAGES.addPolicy })[0]);
    expect(mockPush).toHaveBeenCalledWith("/insurance/new");
  });

  it("offers a retry when the first load fails, and recovers", async () => {
    const server = startServer("fail");
    await show(<PoliciesScreen />);
    await screen.findByText(INSURANCE_MESSAGES.couldntLoadList);
    server.list = aPage([aInsurancePolicySummary()]);
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Landlord policy");
  });

  it("keeps what it had and says so when a pull to refresh fails", async () => {
    const server = startServer(aPage([aInsurancePolicySummary()]));
    await show(<PoliciesScreen />);
    await screen.findByText("Landlord policy");
    server.list = "fail";
    await act(async () => {
      await screen.getByTestId("policies-list").props.refreshControl.props.onRefresh();
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Landlord policy")).toBeTruthy();
  });
});

describe("PolicyDetailScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer(aPage([]), "hold");
    await show(<PolicyDetailScreen id="p1" />);
    expect(await screen.findByTestId("policy-detail-skeleton")).toBeTruthy();
  });

  it("shows what you'd need after a leak or a break-in", async () => {
    startServer(aPage([]));
    await show(<PolicyDetailScreen id="p1" />);
    await screen.findByText("Landlord policy");
    for (const text of ["Oak Street · Acme Mutual", "HO-123456", "$500,000", "$2,500", "2% of coverage ($10,000.00)", "Agent is Dana", "declarations.pdf", "Policy Document"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("leaves out what the policy doesn't have", async () => {
    startServer(aPage([]), aPolicy({
      policy_number: null, coverage_amount_cents: null, deductible_cents: null, wind_hail_deductible_pct: null,
      annual_premium_cents: null, annual_total_cents: null, premium_cents: null, fees_and_taxes_cents: null, effective_date: null, expiration_date: null, notes: null, attachments: [], carrier: null, property_name: null,
    }));
    await show(<PolicyDetailScreen id="p1" />);
    await screen.findByText(INSURANCE_MESSAGES.noDocuments);
    for (const label of ["Policy number", "Coverage", "Deductible", "Wind and hail deductible", "Premium per year", "Total per year", "Fees and taxes", "Term", "Notes"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("opens a file with a fresh link, not the one the page loaded with", async () => {
    const server = startServer(aPage([]));
    await show(<PolicyDetailScreen id="p1" />);
    await screen.findByText("declarations.pdf");
    server.detail = aPolicy({ attachments: [aFile({ presigned_url: "https://files.example/new" })] });
    await fireEvent.press(screen.getByRole("button", { name: "Open declarations.pdf" }));
    await waitFor(() => expect(openAttachmentFile).toHaveBeenCalledWith("https://files.example/new", expect.objectContaining({ id: "f1" })));
  });

  it("says so when a file won't open", async () => {
    const server = startServer(aPage([]));
    await show(<PolicyDetailScreen id="p1" />);
    await screen.findByText("declarations.pdf");
    server.detail = aPolicy({ attachments: [aFile({ presigned_url: null })] });
    await fireEvent.press(screen.getByRole("button", { name: "Open declarations.pdf" }));
    await screen.findByText(INSURANCE_MESSAGES.couldntOpen);
    expect(openAttachmentFile).not.toHaveBeenCalled();
  });

  it("doesn't offer a file that's gone from storage", async () => {
    startServer(aPage([]), aPolicy({ attachments: [aFile({ is_available: false })] }));
    await show(<PolicyDetailScreen id="p1" />);
    await screen.findByText(INSURANCE_MESSAGES.fileMissing);
    expect(screen.queryByRole("button", { name: "Open declarations.pdf" })).toBeNull();
  });

  it("says when the policy is gone, and offers a way back", async () => {
    startServer(aPage([]), "gone");
    await show(<PolicyDetailScreen id="p1" />);
    await screen.findByText(INSURANCE_MESSAGES.cantFind);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("offers a retry when it couldn't load, and recovers", async () => {
    const server = startServer(aPage([]), "fail");
    await show(<PolicyDetailScreen id="p1" />);
    await screen.findByText(INSURANCE_MESSAGES.couldntLoadOne);
    server.detail = aPolicy();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Landlord policy");
  });

  it("keeps what it had when a reload fails", async () => {
    const server = startServer(aPage([]));
    await show(<PolicyDetailScreen id="p1" />);
    await screen.findByText("Landlord policy");
    server.detail = "fail";
    await act(async () => {
      await store.dispatch(insurancePoliciesApi.endpoints.getInsurancePolicyById.initiate("p1", { forceRefetch: true }));
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Landlord policy")).toBeTruthy();
  });
});
