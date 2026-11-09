import "../test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { readDocumentErrorMessage } from "@mybookkeeper/api-client/utils/documentReadErrors";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import NewPolicyScreen from "../src/features/insurance/NewPolicyScreen";
import { formParts } from "../test-support/applicantsServer";
import { File, resetFakeFiles } from "../test-support/fakeFileSystem";
import { aDocument, aDraft, lastInsuranceWrite, startInsuranceServer } from "../test-support/insuranceServer";
import { renderInsurance, resetInsuranceStore } from "../test-support/renderInsurance";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() }, usePreventRemove: jest.fn() }));
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: jest.fn() } }));
jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
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
    const server = startInsuranceServer({ draft: aDraft({ confidence: "medium", warnings: ["The premium looked unclear."] }) });
    await renderInsurance(<NewPolicyScreen />);
    await pickPolicyFile();

    expect(await screen.findByText("Filled in from policy.pdf")).toBeTruthy();
    expect(screen.getByLabelText("Policy name, required").props.value).toBe("Read policy");
    expect(screen.getByLabelText("Carrier").props.value).toBe("Read Mutual");
    expect(screen.getByLabelText("Premium (USD)").props.value).toBe("100");
    expect(screen.getByLabelText("Billed, Monthly")).toBeTruthy();
    expect(screen.getByLabelText("Notes").props.value).toBe("");
    expect(screen.getByText("Summary of the policy.")).toBeTruthy();
    expect(screen.getByText(/Some of these I had to interpret/)).toBeTruthy();
    expect(screen.getByText("The premium looked unclear.")).toBeTruthy();
    const read = server.requests.find((request) => request.url === "/insurance-policies/extract-upload");
    expect(formParts(read?.data).find((part) => part.fieldName === "file")?.type).toBe("application/pdf");
  });

  it("links the saved policy back to the document it came from", async () => {
    const server = startInsuranceServer();
    await renderInsurance(<NewPolicyScreen />);
    await pickPolicyFile();
    await screen.findByText("Filled in from policy.pdf");
    await fireEvent.press(screen.getByLabelText("Property, Choose a property"));
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
    expect(await screen.findByText("Filled in from renewal.pdf")).toBeTruthy();
    const read = server.requests.find((request) => request.url === "/insurance-policies/extract");
    expect(JSON.parse(String(read?.data))).toEqual({ document_id: "d1" });
  });

  it.each([413, 415, 422, 429, 500])("a %s says what to do next", async (status) => {
    startInsuranceServer({ failures: { "POST /insurance-policies/extract-upload": status } });
    await renderInsurance(<NewPolicyScreen />);
    await pickPolicyFile();
    expect(await screen.findByText(readDocumentErrorMessage(status))).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try reading it again" })).toBeTruthy();
  });

  it("says so when the server can't be reached, and reads again on request", async () => {
    const server = startInsuranceServer({ failures: { "POST /insurance-policies/extract-upload": "offline" } });
    await renderInsurance(<NewPolicyScreen />);
    await pickPolicyFile();
    expect(await screen.findByText("I can't reach the server, so I couldn't read that. Want to try again?")).toBeTruthy();
    delete server.failures["POST /insurance-policies/extract-upload"];
    await fireEvent.press(screen.getByRole("button", { name: "Try reading it again" }));
    expect(await screen.findByText("Filled in from policy.pdf")).toBeTruthy();
  });

  it("lets the host choose a different document after a read", async () => {
    startInsuranceServer();
    await renderInsurance(<NewPolicyScreen />);
    await pickPolicyFile();
    await fireEvent.press(await screen.findByRole("button", { name: "Choose a different document" }));
    expect(await screen.findByRole("button", { name: "Choose a file" })).toBeTruthy();
  });

  it("doesn't offer the library when no documents are uploaded", async () => {
    startInsuranceServer();
    await renderInsurance(<NewPolicyScreen />);
    await screen.findByRole("button", { name: "Choose a file" });
    expect(screen.queryByRole("button", { name: "Use a document I've already uploaded" })).toBeNull();
  });
});
