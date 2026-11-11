import "@platform/mobile/test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import { Alert } from "react-native";
import PolicyDetailScreen from "../src/features/insurance/PolicyDetailScreen";
import { formParts, formValue } from "../test-support/applicantsServer";
import { File, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { aPolicyDetail, anAttachment, lastInsuranceWrite, startInsuranceServer } from "../test-support/insuranceServer";
import { renderInsurance, resetInsuranceStore } from "../test-support/renderInsurance";

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { back: () => mockBack(), push: (path: string) => mockPush(path) } }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: jest.fn() } }));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  resetInsuranceStore();
  resetFakeFiles();
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

function confirmAlert(buttonText: string) {
  return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => buttons?.find((button) => button.text === buttonText)?.onPress?.());
}

function pickPdf(name = "paper.pdf") {
  const source = new File(`cache:/DocumentPicker/${name}`);
  source.write("pdf");
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({ canceled: false, assets: [{ uri: source.uri, name, mimeType: "application/pdf" }] } as DocumentPicker.DocumentPickerResult);
}

async function addFile(kindLabel?: string) {
  await fireEvent.press(await screen.findByRole("button", { name: "Add a document" }));
  if (kindLabel) await fireEvent.press(screen.getByRole("radio", { name: kindLabel }));
  pickPdf();
  await fireEvent.press(screen.getByRole("button", { name: "Choose a file" }));
  await screen.findByText("paper.pdf");
  await fireEvent.press(screen.getByRole("button", { name: "Upload" }));
}

describe("policy detail", () => {
  it("shows the policy, its money and its documents", async () => {
    startInsuranceServer();
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    expect(await screen.findByText("Landlord policy")).toBeTruthy();
    expect(screen.getByText("declarations.pdf")).toBeTruthy();
    expect(screen.getByText("Premium per year")).toBeTruthy();
  });

  it("opens the edit screen for a writer", async () => {
    startInsuranceServer();
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Edit this policy" }));
    expect(mockPush).toHaveBeenCalledWith("/insurance/p1/edit");
  });

  it("hides every change from a viewer", async () => {
    startInsuranceServer({ role: "viewer" });
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    await screen.findByText("Landlord policy");
    for (const name of ["Edit this policy", "Delete this policy", "Add a document", "Remove"]) {
      expect(screen.queryByRole("button", { name: new RegExp(name) })).toBeNull();
    }
  });

  it("says when the policy is gone, and offers a retry when it won't load", async () => {
    startInsuranceServer({ policies: [] });
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    expect(await screen.findByText("I can't find that policy.")).toBeTruthy();
  });

  it("offers a retry on a server error", async () => {
    startInsuranceServer({ failures: { "GET /insurance-policies/:id": 500 } });
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    expect(await screen.findByText("I couldn't load that policy.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows a skeleton while loading", async () => {
    startInsuranceServer();
    const answer = api.defaults.adapter as (config: unknown) => Promise<unknown>;
    api.defaults.adapter = ((config: { url?: string }) => (config.url === "/insurance-policies/p1" ? new Promise(() => undefined) : answer(config))) as never;
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    expect(await screen.findByTestId("policy-detail-skeleton")).toBeTruthy();
  });
});

describe("deleting a policy", () => {
  it("asks first, then deletes, confirms and goes back", async () => {
    const server = startInsuranceServer();
    const alert = confirmAlert("Delete this policy");
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Delete this policy" }));
    expect(alert).toHaveBeenCalledWith("Delete this policy?", expect.stringContaining("can't be undone"), expect.any(Array));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(lastInsuranceWrite(server)?.route).toBe("DELETE /insurance-policies/:id");
    expect(await screen.findByText("Policy deleted.")).toBeTruthy();
  });

  it("does nothing when the host keeps it", async () => {
    const server = startInsuranceServer();
    confirmAlert("Keep it");
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Delete this policy" }));
    expect(lastInsuranceWrite(server)).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it.each([
    [403, "You have view-only access, so I can't change policies."],
    [404, "That policy is already gone."],
    [500, "I couldn't delete that policy. Want to try again?"],
    ["offline" as const, "I can't reach the server, so I couldn't delete it. Want to try again?"],
  ])("a %s says %s and stays on the page", async (failure, message) => {
    startInsuranceServer({ failures: { "DELETE /insurance-policies/:id": failure } });
    confirmAlert("Delete this policy");
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Delete this policy" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete this policy" })).toBeTruthy();
  });
});

describe("policy documents", () => {
  it.each([
    [undefined, "policy_document"],
    ["Endorsement", "endorsement"],
    ["Binder", "binder"],
    ["Other", "other"],
  ])("uploads a file as %s", async (label, kind) => {
    const server = startInsuranceServer();
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    await addFile(label);
    expect(await screen.findByText("Document added.")).toBeTruthy();
    const write = lastInsuranceWrite(server);
    expect(write?.route).toBe("POST /insurance-policies/:id/attachments");
    expect(formValue(write?.config.data, "kind")).toBe(kind);
    expect(formParts(write?.config.data).find((part) => part.fieldName === "file")?.type).toBe("application/pdf");
    expect(await screen.findAllByText(/pdf/)).toBeTruthy();
  });

  it.each([
    [413, "That file's too big. I can take up to 10MB."],
    [415, "I can't take that kind of file. A PDF, Word document or photo works."],
    [404, "That policy isn't there any more."],
    [403, "You have view-only access, so I can't change documents."],
    [500, "I couldn't upload that. Want to try again?"],
    ["offline" as const, "I can't reach the server, so I couldn't upload that. Want to try again?"],
  ])("a %s on upload says %s and keeps the file", async (failure, message) => {
    startInsuranceServer({ failures: { "POST /insurance-policies/:id/attachments": failure } });
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    await addFile();
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText("paper.pdf")).toBeTruthy();
  });

  it("asks before removing a document, then removes it", async () => {
    const server = startInsuranceServer({ policies: [aPolicyDetail({ attachments: [anAttachment({ id: "f1" })] })] });
    const alert = confirmAlert("Remove");
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: /^Remove/ }));
    expect(alert).toHaveBeenCalledWith("Remove this document?", expect.stringContaining("declarations.pdf"), expect.any(Array));
    expect(await screen.findByText("Document removed.")).toBeTruthy();
    expect(lastInsuranceWrite(server)?.route).toBe("DELETE /insurance-policies/:id/attachments/:id");
    await waitFor(() => expect(screen.queryByText("declarations.pdf")).toBeNull());
  });

  it("leaves the document alone when removal is cancelled", async () => {
    const server = startInsuranceServer();
    confirmAlert("Cancel");
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: /^Remove/ }));
    expect(lastInsuranceWrite(server)).toBeNull();
  });

  it.each([
    [404, "That document is already gone."],
    [403, "You have view-only access, so I can't change documents."],
    [500, "I couldn't remove that. Want to try again?"],
    ["offline" as const, "I couldn't remove that. Want to try again?"],
  ])("a %s on remove says %s", async (failure, message) => {
    startInsuranceServer({ failures: { "DELETE /insurance-policies/:id/attachments/:id": failure } });
    confirmAlert("Remove");
    await renderInsurance(<PolicyDetailScreen id="p1" />);
    await fireEvent.press(await screen.findByRole("button", { name: /^Remove/ }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText("declarations.pdf")).toBeTruthy();
  });
});
