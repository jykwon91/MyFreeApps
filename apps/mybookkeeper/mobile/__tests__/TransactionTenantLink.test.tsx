import { attributionSourceLabel } from "@mybookkeeper/api-client/constants/attributionLabels";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { TENANT_LINK_FAILURE, TENANT_LINK_MESSAGES as MESSAGES } from "../src/constants/transactionTenantLink";
import TransactionTenantLink from "../src/features/transactions/TransactionTenantLink";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { store } from "../src/lib/store";
import { aTransaction } from "../test-support/transactionsServer";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: jest.fn() }));

const mockModal: { onDismiss?: () => void } = {};
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, onDismiss, children }: { visible: boolean; onDismiss?: () => void; children: unknown }) => {
    if (onDismiss) mockModal.onDismiss = onDismiss;
    return visible ? children : null;
  },
}));

const originalAdapter = api.defaults.adapter;

interface Server {
  sent: { url: string; body: unknown }[];
  tenantReads: number;
  applicantReads: number;
  attributeStatus: number;
  applicantStatus: number;
}

function serve(): Server {
  const server: Server = { sent: [], tenantReads: 0, applicantReads: 0, attributeStatus: 200, applicantStatus: 200 };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const url = config.url ?? "";
    const respond = (status: number, data: unknown) => {
      const response = { data, status, statusText: "", headers: {}, config } as never;
      if (status >= 400) throw Object.assign(new Error("refused"), { isAxiosError: true, response, config });
      return response;
    };
    if (url === "/applicants/tenants") {
      server.tenantReads += 1;
      return respond(200, {
        items: [
          { id: "a1", legal_name: "Jane Smith", tenant_ended_at: null, contract_end: "2099-01-01" },
          { id: "a2", legal_name: "Omar Reyes", tenant_ended_at: null, contract_end: "2099-01-01" },
        ],
        total: 2,
        has_more: false,
      });
    }
    if (url.startsWith("/applicants/")) {
      server.applicantReads += 1;
      return respond(server.applicantStatus, { id: "a1", legal_name: "Jane Smith" });
    }
    if (url.endsWith("/attribute")) {
      server.sent.push({ url, body: JSON.parse(String(config.data)) });
      return respond(server.attributeStatus, { ok: true, transaction_id: "t1" });
    }
    return respond(200, {});
  };
  api.defaults.adapter = adapter;
  return server;
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{children}</ToastProvider>
    </Provider>
  );
}

function income(overrides: Partial<Transaction> = {}): Transaction {
  return aTransaction({ id: "t1", transaction_type: "income", applicant_id: null, attribution_source: null, ...overrides });
}

async function show(transaction: Transaction) {
  await render(<TransactionTenantLink canWrite={jest.mocked(useCanWrite)()} transaction={transaction} />, { wrapper: Screen });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pickTenant(name: string) {
  await fireEvent.press(await screen.findByRole("radio", { name }));
  await act(async () => mockModal.onDismiss?.());
  await settle();
}

async function pressAlert(button: string) {
  await act(async () => {
    jest.mocked(Alert.alert).mock.lastCall?.[2]?.find((option) => option.text === button)?.onPress?.();
  });
  await settle();
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  jest.mocked(useCanWrite).mockReturnValue(true);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  mockModal.onDismiss = undefined;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("who paid", () => {
  it("says when nobody is linked and offers to link", async () => {
    serve();
    await show(income());
    expect(screen.getByText(MESSAGES.notLinked)).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.link })).toBeTruthy();
  });

  it("names the linked tenant and how the link was made", async () => {
    serve();
    await show(income({ applicant_id: "a1", attribution_source: "auto_alias" }));
    expect(await screen.findByText(`${MESSAGES.linkedTo} Jane Smith (${attributionSourceLabel("auto_alias")})`)).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.relink })).toBeTruthy();
  });

  it("still says someone is linked when the name won't load", async () => {
    serve().applicantStatus = 500;
    await show(income({ applicant_id: "a1", attribution_source: "manual" }));
    await settle();
    expect(screen.getByText(`${MESSAGES.linkedTo} ${MESSAGES.thisTenant} (manual)`)).toBeTruthy();
  });

  it("shows a viewer a link but no way to change it", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve();
    await show(income({ applicant_id: "a1", attribution_source: "manual" }));
    expect(await screen.findByText(`${MESSAGES.linkedTo} Jane Smith (manual)`)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.relink })).toBeNull();
  });

  it("shows a viewer nothing when nobody is linked", async () => {
    jest.mocked(useCanWrite).mockReturnValue(false);
    serve();
    await show(income());
    expect(screen.queryByText(MESSAGES.notLinked)).toBeNull();
  });
});

describe("linking", () => {
  it("loads no tenants until the picker is opened", async () => {
    const server = serve();
    await show(income());
    await settle();
    expect(server.tenantReads).toBe(0);
  });

  it("asks, then sends the picked tenant and says it's done", async () => {
    const server = serve();
    await show(income());
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.link }));
    await pickTenant("Omar Reyes");
    expect(Alert.alert).toHaveBeenCalledWith(`${MESSAGES.confirmAction} Omar Reyes?`, MESSAGES.confirmBody, expect.anything(), expect.anything());
    expect(server.sent).toEqual([]);
    await pressAlert(MESSAGES.confirmAction);
    expect(server.sent).toEqual([{ url: "/transactions/t1/attribute", body: { applicant_id: "a2" } }]);
    expect(await screen.findByText(`${MESSAGES.linked} Omar Reyes.`)).toBeTruthy();
  });

  it("says linking also approves and marks it as rent income", async () => {
    serve();
    await show(income());
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.link }));
    await pickTenant("Jane Smith");
    expect(jest.mocked(Alert.alert).mock.lastCall?.[1]).toMatch(/approves .* rent income/);
  });

  it("shows the linked tenant as chosen and sends nothing when it is picked again", async () => {
    const server = serve();
    await show(income({ applicant_id: "a1", attribution_source: "auto_exact" }));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.relink }));
    expect(await screen.findByRole("radio", { name: "Jane Smith", checked: true })).toBeTruthy();
    await pickTenant("Jane Smith");
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(server.sent).toEqual([]);
  });

  it("sends nothing when the question is cancelled", async () => {
    const server = serve();
    await show(income());
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.link }));
    await pickTenant("Jane Smith");
    await pressAlert("Cancel");
    expect(server.sent).toEqual([]);
  });

  it.each([
    [undefined, TENANT_LINK_FAILURE.serverError, 500],
    [undefined, TENANT_LINK_FAILURE.viewOnly, 403],
    [undefined, TENANT_LINK_FAILURE.gone, 404],
  ])("tells a refusal in fixed words (%#)", async (_unused, copy, status) => {
    const server = serve();
    server.attributeStatus = status;
    await show(income());
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.link }));
    await pickTenant("Jane Smith");
    await pressAlert(MESSAGES.confirmAction);
    expect(await screen.findByText(copy)).toBeTruthy();
  });
});
