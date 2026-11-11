import "@platform/mobile/test-support/reactNativeFormData";
import { INSURANCE_UPLOAD_MIME_TYPES } from "@mybookkeeper/api-client/constants/insuranceUploads";
import api from "@platform/core/lib/api";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import NewPolicyScreen from "../src/features/insurance/NewPolicyScreen";
import { formParts } from "../test-support/applicantsServer";
import { File, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { aDocument, aDraft, lastInsuranceWrite, startInsuranceServer } from "../test-support/insuranceServer";
import { POLICY_READER_MESSAGES as MESSAGES } from "../src/constants/insuranceForm";
import { renderInsurance, resetInsuranceStore } from "../test-support/renderInsurance";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() }, usePreventRemove: jest.fn() }));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});
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
});

async function pickPolicyFile(name = "policy.pdf") {
  const source = new File(`cache:/DocumentPicker/${name}`);
  source.write("pdf");
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({ canceled: false, assets: [{ uri: source.uri, name, mimeType: "application/pdf" }] } as DocumentPicker.DocumentPickerResult);
  await fireEvent.press(await screen.findByRole("button", { name: "Choose a file" }));
}

describe("reading a policy from a document", () => {
  it("reads a picked file straight away and fills in the form without touching the notes", async () => {
    const server = startInsuranceServer({ draft: aDraft({ confidence: "medium", warnings: ["The premium looked unclear."], unrepresented: ["Flood excluded"] }) });
    await renderInsurance(<NewPolicyScreen />);
    await pickPolicyFile();

    expect(await screen.findByText(MESSAGES.readDone("policy.pdf"))).toBeTruthy();
    expect(screen.getByLabelText("Policy name, required").props.value).toBe("Read policy");
    expect(screen.getByLabelText("Carrier").props.value).toBe("Read Mutual");
    expect(screen.getByLabelText("Premium (USD)").props.value).toBe("100");
    expect(screen.getByLabelText("Billed, Monthly")).toBeTruthy();
    expect(screen.getByLabelText("Notes").props.value).toBe("");
    expect(screen.getByText(MESSAGES.confidence.medium)).toBeTruthy();
    expect(screen.getByText("The premium looked unclear.")).toBeTruthy();
    await fireEvent.press(screen.getByText(MESSAGES.otherTerms));
    expect(screen.getByText("• Flood excluded")).toBeTruthy();
    expect(screen.getByText(MESSAGES.myNotes)).toBeTruthy();
    expect(screen.getByText("Summary of the policy.")).toBeTruthy();
    const read = server.requests.find((request) => request.url === "/insurance-policies/extract-upload");
    expect(formParts(read?.data).find((part) => part.fieldName === "file")?.type).toBe("application/pdf");
  });

  it("links the saved policy back to the document it came from", async () => {
    const server = startInsuranceServer();
    await renderInsurance(<NewPolicyScreen />);
    await pickPolicyFile();
    await screen.findByText(MESSAGES.readDone("policy.pdf"));
    await fireEvent.press(screen.getByLabelText("Property *, Choose a property"));
    await fireEvent.press(await screen.findByRole("radio", { name: "Oak Street" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save policy" }));
    await waitFor(() => expect(lastInsuranceWrite(server)?.route).toBe("POST /insurance-policies"));
    expect(lastInsuranceWrite(server)?.body).toMatchObject({ source_document_id: "d9", policy_name: "Read policy", premium_frequency: "monthly" });
  });

  it("reads a document that's already uploaded", async () => {
    const server = startInsuranceServer({ documents: [aDocument({ id: "d1", file_name: "renewal.pdf" })] });
    await renderInsurance(<NewPolicyScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Use a document I've already uploaded" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "renewal.pdf" }));
    expect(await screen.findByText(MESSAGES.readDone("renewal.pdf"))).toBeTruthy();
    const read = server.requests.find((request) => request.url === "/insurance-policies/extract");
    expect(JSON.parse(String(read?.data))).toEqual({ document_id: "d1" });
  });

  it.each([[413, MESSAGES.tooBig], [415, MESSAGES.wrongType], [422, MESSAGES.unreadable], [429, MESSAGES.tooMany], [500, MESSAGES.somethingWrong]])("a %s says what to do next", async (status, message) => {
    startInsuranceServer({ failures: { "POST /insurance-policies/extract-upload": status } });
    await renderInsurance(<NewPolicyScreen />);
    await pickPolicyFile();
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try reading it again" })).toBeTruthy();
  });

  it("says so when the server can't be reached, and reads again on request", async () => {
    const server = startInsuranceServer({ failures: { "POST /insurance-policies/extract-upload": "offline" } });
    await renderInsurance(<NewPolicyScreen />);
    await pickPolicyFile();
    expect(await screen.findByText(MESSAGES.lostConnection)).toBeTruthy();
    delete server.failures["POST /insurance-policies/extract-upload"];
    await fireEvent.press(screen.getByRole("button", { name: "Try reading it again" }));
    expect(await screen.findByText(MESSAGES.readDone("policy.pdf"))).toBeTruthy();
  });

  it("lets the host drop a file that couldn't be read", async () => {
    startInsuranceServer({ failures: { "POST /insurance-policies/extract-upload": 422 } });
    await renderInsurance(<NewPolicyScreen />);
    await pickPolicyFile();
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.neverMind }));
    expect(screen.queryByRole("button", { name: MESSAGES.tryAgain })).toBeNull();
  });

  it("says so when no documents are uploaded", async () => {
    startInsuranceServer();
    await renderInsurance(<NewPolicyScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: MESSAGES.fromLibrary }));
    expect(await screen.findByText(MESSAGES.libraryEmpty)).toBeTruthy();
  });

  it("lets a Word document be picked, as the insurance upload types allow", async () => {
    startInsuranceServer();
    await renderInsurance(<NewPolicyScreen />);
    await pickPolicyFile();
    await screen.findByText(MESSAGES.readDone("policy.pdf"));
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ type: INSURANCE_UPLOAD_MIME_TYPES }));
  });
});
