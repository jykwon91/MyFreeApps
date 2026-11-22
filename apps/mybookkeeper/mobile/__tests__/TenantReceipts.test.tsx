import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import type { SignedLeaseSummary } from "@mybookkeeper/api-client/types/lease/signed-lease-summary";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Provider } from "react-redux";
import ApplicantDetailScreen from "../src/features/applicants/ApplicantDetailScreen";
import { openAttachmentFile } from "../src/features/documents/openDocumentFile";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { aLease } from "../test-support/aLease";
import { anApplicant, startApplicantServer } from "../test-support/applicantsServer";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../src/features/documents/openDocumentFile", () => ({ openAttachmentFile: jest.fn() }));

const originalAdapter = api.defaults.adapter;

function aFile(overrides: Partial<SignedLeaseAttachment> = {}): SignedLeaseAttachment {
  return {
    id: "f1", lease_id: "l1", filename: "march-receipt.pdf", storage_key: "k", content_type: "application/pdf", size_bytes: 10,
    kind: "rent_receipt", uploaded_by_user_id: "u1", uploaded_at: "2026-03-02T12:00:00Z", presigned_url: "https://files.example/first",
    is_available: true, is_locked: false, ...overrides,
  };
}

function aSummary(id: string): SignedLeaseSummary {
  const { attachments: _attachments, ...summary } = aLease({ id });
  return { ...summary, template_ids: [] };
}

beforeEach(() => {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <ApplicantDetailScreen id="a1" />
      </ToastProvider>
    </Provider>,
  );
}

describe("the applicant page's Receipts section", () => {
  it("gathers the receipts from every lease, and leaves other files out", async () => {
    const server = startApplicantServer([anApplicant({ stage: "lease_signed" })]);
    server.leases = [aSummary("l1"), aSummary("l2")];
    server.leaseDetails = [
      aLease({ id: "l1", attachments: [aFile(), aFile({ id: "f2", filename: "signed.pdf", kind: "signed_lease" })] }),
      aLease({ id: "l2", attachments: [aFile({ id: "f3", lease_id: "l2", filename: "june-receipt.pdf" })] }),
    ];
    await renderScreen();
    expect(await screen.findByText("march-receipt.pdf")).toBeTruthy();
    expect(screen.getByText("june-receipt.pdf")).toBeTruthy();
    expect(screen.getByText("Receipts")).toBeTruthy();
    expect(screen.queryByText("signed.pdf")).toBeNull();
  });

  it("opens a receipt with a fresh link", async () => {
    const server = startApplicantServer([anApplicant({ stage: "lease_signed" })]);
    server.leases = [aSummary("l1")];
    server.leaseDetails = [aLease({ attachments: [aFile()] })];
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Open march-receipt.pdf" }));
    await waitFor(() => expect(openAttachmentFile).toHaveBeenCalledWith("https://files.example/first", expect.objectContaining({ id: "f1" })));
  });

  it("shows a placeholder while the leases load", async () => {
    const server = startApplicantServer([anApplicant({ stage: "lease_signed" })]);
    server.leases = [aSummary("l1")];
    server.leaseDetails = [aLease({ attachments: [aFile()] })];
    const answer = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = (config) => (config.url === "/signed-leases/l1" ? new Promise(() => undefined) : answer(config));
    await renderScreen();
    expect(await screen.findByLabelText("Loading their receipts")).toBeTruthy();
  });

  it("has no Receipts section when they have no leases", async () => {
    startApplicantServer([anApplicant({ stage: "lease_signed" })]);
    await renderScreen();
    expect(await screen.findByText("Dana Reed")).toBeTruthy();
    expect(screen.queryByText("Receipts")).toBeNull();
  });
});
