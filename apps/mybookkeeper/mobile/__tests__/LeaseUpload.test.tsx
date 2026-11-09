import "../test-support/reactNativeFormData";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import LeaseDetailScreen from "../src/features/leases/LeaseDetailScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { formParts, formValue } from "../test-support/applicantsServer";
import { fakeFiles, File, resetFakeFiles } from "../test-support/fakeFileSystem";

jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: jest.fn() } }));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const ADD = { name: "Add file" };

function aFile(overrides: Partial<SignedLeaseAttachment> = {}): SignedLeaseAttachment {
  return {
    id: "f1",
    lease_id: "l1",
    filename: "signed.pdf",
    storage_key: "k",
    content_type: "application/pdf",
    size_bytes: 10,
    kind: "signed_lease",
    uploaded_by_user_id: "u1",
    uploaded_at: "2026-02-01T12:00:00Z",
    presigned_url: "https://files.example/first",
    is_available: true,
    ...overrides,
  };
}

function aLease(attachments: SignedLeaseAttachment[] = []): SignedLeaseDetail {
  return {
    id: "l1",
    user_id: "u1",
    organization_id: "w1",
    templates: [],
    applicant_id: "a1",
    applicant_legal_name: "Dana Reed",
    listing_id: null,
    kind: "imported",
    values: {},
    status: "active",
    starts_on: "2026-03-01",
    ends_on: "2099-02-28",
    notes: null,
    generated_at: null,
    sent_at: null,
    signed_at: null,
    ended_at: null,
    auto_email_tenant: false,
    last_emailed_to_tenant_at: null,
    created_at: "2026-02-01T12:00:00Z",
    updated_at: "2026-02-01T12:00:00Z",
    attachments,
    latest_extension: null,
    parent_lease_id: null,
    successor_lease_id: null,
  };
}

interface FakeServer {
  lease: SignedLeaseDetail;
  role: string;
  uploadFailure: number | null;
  uploads: AxiosRequestConfig[];
}

function startServer(attachments: SignedLeaseAttachment[] = []): FakeServer {
  const server: FakeServer = { lease: aLease(attachments), role: "owner", uploadFailure: null, uploads: [] };
  const adapter: AxiosAdapter = (config) => {
    const respond = (data: unknown, status = 200) => {
      const response = { data, status, statusText: "", headers: {}, config };
      if (status < 300) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error("failed"), { isAxiosError: true, config, response }));
    };
    if (config.url === "/organizations") return respond([{ id: "w1", name: "Mine", org_role: server.role }]);
    if (config.url === "/signed-leases/l1") return respond(server.lease);
    if (config.url === "/signed-leases/l1/attachments") {
      server.uploads.push(config);
      if (server.uploadFailure) return respond({ detail: "A developer's message" }, server.uploadFailure);
      const name = formParts(config.data).find((part) => part.fieldName === "file")?.name ?? "";
      const added = aFile({ id: `f${server.uploads.length}`, filename: name, kind: formValue(config.data, "kind") as SignedLeaseAttachment["kind"] });
      server.lease = { ...server.lease, attachments: [...server.lease.attachments, added] };
      return respond(added, 201);
    }
    return respond({ detail: "Not found" }, 404);
  };
  api.defaults.adapter = adapter;
  return server;
}

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <LeaseDetailScreen id="l1" />
      </ToastProvider>
    </Provider>,
  );
}

function pickedPdf(name = "paper.pdf") {
  const source = new File(`cache:/DocumentPicker/${name}`);
  source.write("pdf");
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: source.uri, name, mimeType: "application/pdf" }],
  } as DocumentPicker.DocumentPickerResult);
}

async function chooseFile() {
  pickedPdf();
  await fireEvent.press(screen.getByRole("button", { name: "Choose a file" }));
  await screen.findByText("paper.pdf");
}

function heldFiles(): string[] {
  return fakeFiles().filter((uri) => uri.includes("held-uploads"));
}

describe("adding a file to a lease", () => {
  beforeEach(() => {
    session.tokenStore.set("token");
    store.dispatch(baseApi.util.resetApiState());
    store.dispatch(workspaceChosen("w1"));
    jest.clearAllMocks();
    resetFakeFiles();
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  it("adds the signed copy and shows it on the page", async () => {
    const server = startServer();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add the signed copy" }));
    await chooseFile();
    await fireEvent.press(screen.getByRole("button", ADD));

    expect(await screen.findByText("Added paper.pdf.")).toBeTruthy();
    expect(formValue(server.uploads[0].data, "kind")).toBe("signed_lease");
    expect(formParts(server.uploads[0].data).find((part) => part.fieldName === "file")?.type).toBe("application/pdf");
    expect(await screen.findByRole("button", { name: "Open paper.pdf" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add the signed copy" })).toBeNull();
    expect(heldFiles()).toHaveLength(0);
  });

  it("lets the host say what the file is when they didn't start from the signed copy", async () => {
    const server = startServer([aFile()]);
    await renderScreen();
    expect(await screen.findByRole("button", { name: "Open signed.pdf" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add the signed copy" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Add a file" }));
    await chooseFile();
    await fireEvent.press(screen.getByRole("radio", { name: "Notice" }));
    await fireEvent.press(screen.getByRole("button", ADD));
    await screen.findByText("Added paper.pdf.");
    expect(formValue(server.uploads[0].data, "kind")).toBe("notice");
  });

  it("works the type out from each file's name when the host leaves it to the app, as the website does", async () => {
    const server = startServer([aFile()]);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add a file" }));
    expect(screen.getByRole("radio", { name: "Pick for me, from the file's name" })).toBeTruthy();
    for (const name of ["Move-in inspection.pdf", "Renters insurance.pdf", "Pet addendum.pdf"]) {
      pickedPdf(name);
      await fireEvent.press(screen.getByRole("button", { name: "Choose a file" }));
      await screen.findByText(name);
    }
    await fireEvent.press(screen.getByRole("button", ADD));
    await screen.findByText("Added 3 files.");
    expect(server.uploads.map((upload) => formValue(upload.data, "kind"))).toEqual(["move_in_inspection", "insurance_proof", "signed_addendum"]);
    expect(heldFiles()).toHaveLength(0);
  });

  it("keeps only what didn't go up when one of several files fails, so a retry doesn't send twice", async () => {
    const server = startServer();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add a file" }));
    for (const name of ["one.pdf", "two.pdf"]) {
      pickedPdf(name);
      await fireEvent.press(screen.getByRole("button", { name: "Choose a file" }));
      await screen.findByText(name);
    }
    const original = api.defaults.adapter as AxiosAdapter;
    let calls = 0;
    api.defaults.adapter = (config) => {
      if (config.url === "/signed-leases/l1/attachments" && ++calls === 2) {
        return Promise.reject(Object.assign(new Error("failed"), { isAxiosError: true, config, response: { data: {}, status: 503, statusText: "", headers: {}, config } }));
      }
      return original(config);
    };
    await fireEvent.press(screen.getByRole("button", ADD));
    expect(await screen.findByText("I couldn't save the file just now. It's still here, so try again in a bit.")).toBeTruthy();
    expect(await screen.findByText("Added one.pdf.")).toBeTruthy();
    expect(heldFiles()).toHaveLength(1);
    expect(heldFiles()[0]).toContain("two.pdf");

    await fireEvent.press(screen.getByRole("button", ADD));
    await screen.findByText("Added two.pdf.");
    expect(server.uploads.map((upload) => formParts(upload.data).find((part) => part.fieldName === "file")?.name)).toEqual(["one.pdf", "two.pdf"]);
  });

  it("takes a chosen file back out before it's sent", async () => {
    startServer();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add the signed copy" }));
    await chooseFile();
    await fireEvent.press(screen.getByRole("button", { name: "Remove paper.pdf" }));
    expect(screen.queryByText("paper.pdf")).toBeNull();
    expect(screen.getByRole("button", ADD)).toBeDisabled();
    expect(heldFiles()).toHaveLength(0);
  });

  it("doesn't offer files the app makes itself", async () => {
    startServer();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add a file" }));
    expect(screen.queryByRole("radio", { name: "Rendered original" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Rent receipt" })).toBeNull();
  });

  it("needs a file first", async () => {
    startServer();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add the signed copy" }));
    expect(screen.getByRole("button", ADD)).toBeDisabled();
  });

  it("offers nothing to someone who can only read", async () => {
    const server = startServer();
    server.role = "viewer";
    await renderScreen();
    await screen.findByText("No signed copy yet.");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add a file" })).toBeNull());
    expect(screen.queryByRole("button", { name: "Add the signed copy" })).toBeNull();
  });

  it.each([
    [413, "That file is too big. Try a smaller PDF or a lower-resolution photo."],
    [415, "I can't read that kind of file. Use a PDF, Word file, JPEG, PNG or WebP."],
    [503, "I couldn't save the file just now. It's still here, so try again in a bit."],
    [403, "You have view-only access."],
    [404, "That lease is gone, so I couldn't add the file."],
    [500, "I couldn't upload that. Want me to try again?"],
  ])("says what went wrong on a %i and keeps the file", async (status, message) => {
    const server = startServer();
    server.uploadFailure = status;
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add the signed copy" }));
    await chooseFile();
    await fireEvent.press(screen.getByRole("button", ADD));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("A developer's message")).toBeNull();
    expect(heldFiles()).toHaveLength(1);

    server.uploadFailure = null;
    await fireEvent.press(screen.getByRole("button", ADD));
    await screen.findByText("Added paper.pdf.");
    expect(server.uploads).toHaveLength(2);
  });

  it("asks before throwing away a chosen file, and leaves nothing behind", async () => {
    const alert = jest.spyOn(Alert, "alert");
    startServer();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add the signed copy" }));
    await chooseFile();
    expect(heldFiles()).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", ADD)).toBeTruthy();

    const discard = alert.mock.calls[0][2]?.find((button) => button.text === "Discard");
    await act(async () => discard?.onPress?.());
    expect(screen.queryByRole("button", ADD)).toBeNull();
    expect(heldFiles()).toHaveLength(0);
  });

  it("can't save while another file is on its way in, and ignores a second pick", async () => {
    startServer();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add the signed copy" }));
    await chooseFile();

    let finish: (result: DocumentPicker.DocumentPickerResult) => void = () => {};
    const replacement = new File("cache:/DocumentPicker/second.pdf");
    replacement.write("pdf");
    jest.mocked(DocumentPicker.getDocumentAsync).mockClear();
    jest.mocked(DocumentPicker.getDocumentAsync).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const choose = screen.getByRole("button", { name: "Choose a file" });
    await fireEvent.press(choose);
    expect(screen.getByRole("button", ADD)).toBeDisabled();
    await fireEvent.press(choose);
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1);

    await act(async () => finish({ canceled: false, assets: [{ uri: replacement.uri, name: "second.pdf", mimeType: "application/pdf" }] } as DocumentPicker.DocumentPickerResult));
    await screen.findByText("second.pdf");
    expect(screen.getByRole("button", ADD)).toBeEnabled();
    expect(heldFiles()).toHaveLength(2);
    expect(heldFiles().some((uri) => uri.includes("second.pdf"))).toBe(true);
  });

  it("works out the type when the picker doesn't say", async () => {
    const server = startServer();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add the signed copy" }));
    const source = new File("cache:/DocumentPicker/lease.docx");
    source.write("docx");
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: source.uri, name: "lease.docx", mimeType: undefined }],
    } as DocumentPicker.DocumentPickerResult);
    await fireEvent.press(screen.getByRole("button", { name: "Choose a file" }));
    await screen.findByText("lease.docx");
    await fireEvent.press(screen.getByRole("button", ADD));
    await screen.findByText("Added lease.docx.");
    expect(formParts(server.uploads[0].data).find((part) => part.fieldName === "file")?.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("doesn't call a saved upload failed when the copy won't delete", async () => {
    startServer();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add the signed copy" }));
    await chooseFile();
    jest.spyOn(File.prototype, "delete").mockImplementation(() => {
      throw new Error("busy");
    });
    await fireEvent.press(screen.getByRole("button", ADD));
    expect(await screen.findByText("Added paper.pdf.")).toBeTruthy();
    expect(warn).toHaveBeenCalled();
  });

  it("closing one sheet leaves another's file alone", async () => {
    startServer();
    const other = new File("cache:/held-uploads/other.pdf");
    other.write("pdf");
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add the signed copy" }));
    await chooseFile();
    await fireEvent.press(screen.getByRole("button", ADD));
    await screen.findByText("Added paper.pdf.");
    expect(heldFiles()).toEqual([other.uri]);
  });

  it("closes straight away when nothing was chosen", async () => {
    const alert = jest.spyOn(Alert, "alert");
    startServer();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add a file" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(alert).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", ADD)).toBeNull();
  });

  it("says so when the camera isn't allowed", async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({ granted: false } as ImagePicker.CameraPermissionResponse);
    startServer();
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", { name: "Add a file" }));
    await fireEvent.press(screen.getByRole("button", { name: "Take a photo of the paper copy" }));
    expect(await screen.findByText("I need camera access for that. You can turn it on in Settings.")).toBeTruthy();
  });
});
