import "../test-support/reactNativeFormData";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";
import { FORM_MESSAGES } from "../src/constants/forms";
import { LEASE_TEMPLATE_CREATE_COPY } from "@mybookkeeper/api-client/constants/leaseTemplateCreateCopy";
import { LEASE_TEMPLATE_UPLOAD_PROBLEMS } from "@mybookkeeper/api-client/constants/leaseTemplateUpload";
import { LEASE_TEMPLATE_DELETE_COPY, PLACEHOLDER_SAVE_COPY } from "../src/constants/leaseTemplateFailures";
import { LEASE_TEMPLATE_FORM_MESSAGES as FORM } from "../src/constants/leaseTemplateForm";
import { PLACEHOLDER_MESSAGES } from "../src/constants/leasePlaceholderEdit";
import { LEASE_TEMPLATE_MESSAGES, deleteTemplateTitle } from "../src/constants/leaseTemplates";
import LeaseTemplateCreateScreen from "../src/features/leaseTemplates/LeaseTemplateCreateScreen";
import LeaseTemplateDetailScreen from "../src/features/leaseTemplates/LeaseTemplateDetailScreen";
import LeaseTemplatePlaceholdersScreen from "../src/features/leaseTemplates/LeaseTemplatePlaceholdersScreen";
import { takeSuggestions } from "../src/features/leaseTemplates/leaseTemplateSuggestions";
import PlaceholderEditScreen from "../src/features/leaseTemplates/PlaceholderEditScreen";
import { formParts, formValue } from "../test-support/applicantsServer";
import { fakeFiles, File, resetFakeFiles } from "../test-support/fakeFileSystem";
import { aServerPlaceholder, aServerTemplate, BAD_TYPE_DETAIL, startLeaseTemplatesServer, TOO_BIG_DETAIL } from "../test-support/leaseTemplatesServer";
import { mockPreventRemove, mockRouter, pressAlertButton, restoreApi, show, signInToWorkspace } from "../test-support/listingsHarness";

jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("expo-router", () => jest.requireActual("../test-support/listingsHarness").expoRouterMock());
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  alertSpy = signInToWorkspace();
  resetFakeFiles();
  mockPreventRemove.active = false;
  mockPreventRemove.callback = null;
});

afterEach(restoreApi);

function pick(name: string, mimeType = "text/markdown", size?: number): void {
  const source = new File(`cache:/DocumentPicker/${name}`);
  source.write("body");
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({ canceled: false, assets: [{ uri: source.uri, name, mimeType, size }] } as DocumentPicker.DocumentPickerResult);
}

async function chooseFile(name = "lease.md", mimeType = "text/markdown", size?: number): Promise<void> {
  pick(name, mimeType, size);
  await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${FORM.addFile}|^${FORM.addAnotherFile}`) }));
  await screen.findByText(name);
}

async function fillAndUpload(): Promise<void> {
  await fireEvent.changeText(await screen.findByLabelText(new RegExp(FORM.name)), "Room lease");
  await chooseFile();
  await fireEvent.press(screen.getByRole("button", { name: FORM.upload }));
}

describe("uploading a template", () => {
  it("uploads the files, has the AI read them, and opens the new template", async () => {
    const server = startLeaseTemplatesServer([]);
    server.suggestions = { suggestions: [{ key: "TENANT NAME", description: "Who rents", input_type: "text" }], truncated: false, pages_note: null };
    await show(<LeaseTemplateCreateScreen />);
    await fillAndUpload();

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/lease-templates/t1"));
    const upload = server.writes[0];
    expect(formValue(upload.data, "name")).toBe("Room lease");
    expect(formParts(upload.data).find((part) => part.fieldName === "files")?.name).toBe("lease.md");
    expect(server.writes[1].url).toBe("/lease-templates/t1/suggest-placeholders");
    expect(fakeFiles().filter((uri) => uri.includes("held-uploads"))).toHaveLength(0);
  });

  it("hands the AI suggestions to the template screen once", async () => {
    const server = startLeaseTemplatesServer([]);
    server.suggestions = { suggestions: [{ key: "TENANT NAME", description: "Who rents", input_type: "text" }], truncated: false, pages_note: null };
    await show(<LeaseTemplateCreateScreen />);
    await fillAndUpload();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
    await act(async () => undefined);

    await show(<LeaseTemplateDetailScreen id="t1" />);
    expect(await screen.findByTestId("ai-suggestions")).toBeTruthy();
    expect(screen.getByText("[TENANT NAME]")).toBeTruthy();
  });

  it("still opens the template when the AI read fails", async () => {
    const server = startLeaseTemplatesServer([]);
    server.suggestions = "fail";
    await show(<LeaseTemplateCreateScreen />);
    await fillAndUpload();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/lease-templates/t1"));
  });

  it("holds the upload button and says what's missing, only after a try", async () => {
    const server = startLeaseTemplatesServer([]);
    await show(<LeaseTemplateCreateScreen />);
    expect(screen.queryByRole("alert")).toBeNull();
    await fireEvent.press(await screen.findByRole("button", { name: FORM.upload }));
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(server.writes).toHaveLength(0);
  });

  it("shows the server's sentence for a file that's too big, keeps the files, and sends them again on retry", async () => {
    const server = startLeaseTemplatesServer([]);
    server.failNext.push({ match: "/lease-templates", status: 413, detail: TOO_BIG_DETAIL, once: true });
    await show(<LeaseTemplateCreateScreen />);
    await fillAndUpload();
    expect(await screen.findByText(TOO_BIG_DETAIL)).toBeTruthy();
    expect(screen.getByText("lease.md")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: FORM.upload }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/lease-templates/t1"));
    expect(server.writes.filter((write) => write.url === "/lease-templates")).toHaveLength(2);
  });

  it("uses fixed wording for a wrong file type, not the server's sentence", async () => {
    const server = startLeaseTemplatesServer([]);
    server.failNext.push({ match: "/lease-templates", status: 415, detail: BAD_TYPE_DETAIL, once: true });
    await show(<LeaseTemplateCreateScreen />);
    await fillAndUpload();
    expect(await screen.findByText(LEASE_TEMPLATE_CREATE_COPY.badType)).toBeTruthy();
    expect(screen.queryByText(BAD_TYPE_DETAIL)).toBeNull();
  });

  it("says the files are too large to send together when the proxy refuses with no message", async () => {
    const server = startLeaseTemplatesServer([]);
    server.failNext.push({ match: "/lease-templates", status: 413, detail: "", once: true });
    await show(<LeaseTemplateCreateScreen />);
    await fillAndUpload();
    expect(await screen.findByText(LEASE_TEMPLATE_CREATE_COPY.tooBigTogether)).toBeTruthy();
    expect(screen.queryByText(LEASE_TEMPLATE_CREATE_COPY.tooBig)).toBeNull();
  });

  it("stops a file over 25 MB before sending any of it", async () => {
    const server = startLeaseTemplatesServer([]);
    await show(<LeaseTemplateCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(FORM.name)), "Room lease");
    await chooseFile("huge.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 26 * 1024 * 1024);
    await fireEvent.press(screen.getByRole("button", { name: FORM.upload }));
    expect(await screen.findByText(LEASE_TEMPLATE_UPLOAD_PROBLEMS.file_too_big)).toBeTruthy();
    expect(server.writes).toHaveLength(0);
  });

  it("stops files that are too large together, which the proxy would refuse with no message", async () => {
    const server = startLeaseTemplatesServer([]);
    await show(<LeaseTemplateCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(FORM.name)), "Room lease");
    await chooseFile("a.docx", "application/octet-stream", 20 * 1024 * 1024);
    await chooseFile("b.docx", "application/octet-stream", 20 * 1024 * 1024);
    await fireEvent.press(screen.getByRole("button", { name: FORM.upload }));
    expect(await screen.findByText(LEASE_TEMPLATE_UPLOAD_PROBLEMS.files_too_big_together)).toBeTruthy();
    expect(server.writes).toHaveLength(0);
  });

  it("stops a file the server wouldn't take, by its extension", async () => {
    const server = startLeaseTemplatesServer([]);
    await show(<LeaseTemplateCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(FORM.name)), "Room lease");
    await chooseFile("lease.pdf", "application/pdf", 10);
    await fireEvent.press(screen.getByRole("button", { name: FORM.upload }));
    expect(await screen.findByText(LEASE_TEMPLATE_UPLOAD_PROBLEMS.file_type_unsupported)).toBeTruthy();
    expect(server.writes).toHaveLength(0);
  });

  it("offers Markdown files an Android picker reports without a Markdown type, and sends them by their extension", async () => {
    const server = startLeaseTemplatesServer([]);
    await show(<LeaseTemplateCreateScreen />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(FORM.name)), "Room lease");
    await chooseFile("lease.md", "application/octet-stream", 10);
    expect(jest.mocked(DocumentPicker.getDocumentAsync).mock.calls[0]?.[0]?.type).toEqual(expect.arrayContaining(["text/x-markdown", "text/markdown"]));
    await fireEvent.press(screen.getByRole("button", { name: FORM.upload }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
    expect(formParts(server.writes[0].data).find((part) => part.fieldName === "files")?.type).toBe("text/markdown");
  });

  it("opens the saved template when they go back while the AI is still reading it", async () => {
    let release = () => undefined as void;
    const server = startLeaseTemplatesServer([]);
    server.suggestGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.suggestions = { suggestions: [{ key: "TENANT NAME", description: "", input_type: "text" }], truncated: false, pages_note: null };
    takeSuggestions("t1");
    await show(<LeaseTemplateCreateScreen />);
    await fillAndUpload();
    await screen.findByTestId("lease-template-reading");
    expect(mockPreventRemove.active).toBe(true);
    await act(async () => mockPreventRemove.callback?.({ repeat: jest.fn() }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/lease-templates/t1"));
    expect(alertSpy).not.toHaveBeenCalled();
    await act(async () => release());
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText("Room lease");
    expect(screen.queryByTestId("ai-suggestions")).toBeNull();
  });

  it("says it's still uploading when they go back mid-upload, and keeps going", async () => {
    let release = () => undefined as void;
    const server = startLeaseTemplatesServer([]);
    server.uploadGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await show(<LeaseTemplateCreateScreen />);
    await fillAndUpload();
    await waitFor(() => expect(server.writes).toHaveLength(1));
    await act(async () => mockPreventRemove.callback?.({ repeat: jest.fn() }));
    expect(await screen.findByText(FORM.stillUploading)).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
    await act(async () => release());
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/lease-templates/t1"));
  });

  it("warns it may have saved when the answer is lost, instead of inviting a blind retry", async () => {
    const server = startLeaseTemplatesServer([]);
    server.loseNextAnswer = true;
    await show(<LeaseTemplateCreateScreen />);
    await fillAndUpload();
    expect(await screen.findByText(LEASE_TEMPLATE_CREATE_COPY.noResponse)).toBeTruthy();
    expect(server.templates).toHaveLength(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("uses fixed wording for a server error", async () => {
    const server = startLeaseTemplatesServer([]);
    server.failNext.push({ match: "/lease-templates", status: 500, detail: "Traceback: secret", once: true });
    await show(<LeaseTemplateCreateScreen />);
    await fillAndUpload();
    expect(await screen.findByText(LEASE_TEMPLATE_CREATE_COPY.serverError)).toBeTruthy();
    expect(screen.queryByText("Traceback: secret")).toBeNull();
  });

  it("asks before throwing away what was entered, and not when nothing was", async () => {
    startLeaseTemplatesServer([]);
    await show(<LeaseTemplateCreateScreen />);
    await screen.findByRole("button", { name: FORM.upload });
    expect(mockPreventRemove.active).toBe(false);
    await fireEvent.changeText(screen.getByLabelText(new RegExp(FORM.name)), "Draft");
    expect(mockPreventRemove.active).toBe(true);
    const leave = jest.fn();
    await act(async () => mockPreventRemove.callback?.({ repeat: leave }));
    expect(alertSpy).toHaveBeenCalledWith(FORM_MESSAGES.discardTitle, FORM_MESSAGES.discardBody, expect.any(Array));
    await pressAlertButton(alertSpy, FORM_MESSAGES.keepEditing, act);
    expect(leave).not.toHaveBeenCalled();
  });

  it("tells someone with view-only access why they can't upload", async () => {
    const server = startLeaseTemplatesServer([]);
    server.role = "viewer";
    await show(<LeaseTemplateCreateScreen />);
    expect(await screen.findByText(FORM_MESSAGES.viewOnlyHeading)).toBeTruthy();
    expect(screen.queryByRole("button", { name: FORM.upload })).toBeNull();
  });
});

describe("placeholders", () => {
  it("lists them in order and opens one to edit", async () => {
    startLeaseTemplatesServer([aServerTemplate({ placeholders: [aServerPlaceholder("p2"), aServerPlaceholder("p1")] })]);
    await show(<LeaseTemplatePlaceholdersScreen id="t1" />);
    await screen.findByText("Label p1");
    await fireEvent.press(screen.getByRole("button", { name: /^Label p1\./ }));
    expect(mockRouter.push).toHaveBeenCalledWith("/lease-templates/t1/placeholders/p1");
  });

  it("shows them read-only to someone with view-only access", async () => {
    const server = startLeaseTemplatesServer();
    server.role = "viewer";
    await show(<LeaseTemplatePlaceholdersScreen id="t1" />);
    await screen.findByText(PLACEHOLDER_MESSAGES.introViewOnly);
    expect(screen.queryByRole("button", { name: /^Label p1\./ })).toBeNull();
  });

  it("says when there are none", async () => {
    startLeaseTemplatesServer([aServerTemplate({ placeholders: [] })]);
    await show(<LeaseTemplatePlaceholdersScreen id="t1" />);
    expect(await screen.findByText(PLACEHOLDER_MESSAGES.empty)).toBeTruthy();
  });

  it("sends only what changed and goes back", async () => {
    const server = startLeaseTemplatesServer();
    await show(<PlaceholderEditScreen placeholderId="p1" templateId="t1" />);
    const save = await screen.findByRole("button", { name: PLACEHOLDER_MESSAGES.save });
    expect(save.props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText(new RegExp(PLACEHOLDER_MESSAGES.label)), "Renter name");
    await fireEvent.press(screen.getByRole("button", { name: PLACEHOLDER_MESSAGES.save }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(JSON.parse(String(server.writes[0].data))).toEqual({ display_label: "Renter name" });
    expect(server.templates[0].placeholders[0].display_label).toBe("Renter name");
  });

  it("sends a cleared default as null", async () => {
    const server = startLeaseTemplatesServer([aServerTemplate({ placeholders: [aServerPlaceholder("p1", { default_source: "applicant.legal_name" })] })]);
    await show(<PlaceholderEditScreen placeholderId="p1" templateId="t1" />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(PLACEHOLDER_MESSAGES.defaultSource)), "");
    await fireEvent.press(screen.getByRole("button", { name: PLACEHOLDER_MESSAGES.save }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(JSON.parse(String(server.writes[0].data))).toEqual({ default_source: null });
  });

  it("won't save a blank label", async () => {
    const server = startLeaseTemplatesServer();
    await show(<PlaceholderEditScreen placeholderId="p1" templateId="t1" />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(PLACEHOLDER_MESSAGES.label)), "  ");
    await fireEvent.press(screen.getByRole("button", { name: PLACEHOLDER_MESSAGES.save }));
    expect(server.writes).toHaveLength(0);
    expect(await screen.findByText("Give it a label.")).toBeTruthy();
  });

  it("shows the server's sentence about a rejected expression and keeps the edits for another try", async () => {
    const server = startLeaseTemplatesServer([aServerTemplate({ placeholders: [aServerPlaceholder("p1", { input_type: "computed", computed_expr: "(A - B).days" })] })]);
    server.failNext.push({ match: "/placeholders/", status: 400, detail: "Unsupported expression.", once: true });
    await show(<PlaceholderEditScreen placeholderId="p1" templateId="t1" />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(PLACEHOLDER_MESSAGES.computedExpr)), "(A * B).days");
    await fireEvent.press(screen.getByRole("button", { name: PLACEHOLDER_MESSAGES.save }));
    expect(await screen.findByText("Unsupported expression.")).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("(A * B).days")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: PLACEHOLDER_MESSAGES.save }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(JSON.parse(String(server.writes[1].data))).toEqual({ computed_expr: "(A * B).days" });
    expect(screen.queryByText(PLACEHOLDER_SAVE_COPY.serverError)).toBeNull();
  });

  it("doesn't send an expression it has hidden once the type is no longer computed", async () => {
    const server = startLeaseTemplatesServer([aServerTemplate({ placeholders: [aServerPlaceholder("p1", { input_type: "computed", computed_expr: "(A - B).days" })] })]);
    await show(<PlaceholderEditScreen placeholderId="p1" templateId="t1" />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(PLACEHOLDER_MESSAGES.computedExpr)), "(A * B).days");
    await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${PLACEHOLDER_MESSAGES.type}`) }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Text" }));
    expect(screen.queryByLabelText(new RegExp(PLACEHOLDER_MESSAGES.computedExpr))).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: PLACEHOLDER_MESSAGES.save }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(JSON.parse(String(server.writes[0].data))).toEqual({ input_type: "text" });
  });

  it("trims what's typed, and treats a default of only spaces as clearing it", async () => {
    const server = startLeaseTemplatesServer([aServerTemplate({ placeholders: [aServerPlaceholder("p1", { default_source: "applicant.legal_name" })] })]);
    await show(<PlaceholderEditScreen placeholderId="p1" templateId="t1" />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(PLACEHOLDER_MESSAGES.label)), "  Renter  ");
    await fireEvent.changeText(screen.getByLabelText(new RegExp(PLACEHOLDER_MESSAGES.defaultSource)), "   ");
    await fireEvent.press(screen.getByRole("button", { name: PLACEHOLDER_MESSAGES.save }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(JSON.parse(String(server.writes[0].data))).toEqual({ display_label: "Renter", default_source: null });
  });

  it("asks before discarding an edit", async () => {
    startLeaseTemplatesServer();
    await show(<PlaceholderEditScreen placeholderId="p1" templateId="t1" />);
    await fireEvent.changeText(await screen.findByLabelText(new RegExp(PLACEHOLDER_MESSAGES.label)), "Changed");
    expect(mockPreventRemove.active).toBe(true);
    await act(async () => mockPreventRemove.callback?.({ repeat: jest.fn() }));
    expect(alertSpy).toHaveBeenCalledWith(FORM_MESSAGES.discardTitle, FORM_MESSAGES.discardBody, expect.any(Array));
  });

  it("says when the placeholder is gone", async () => {
    startLeaseTemplatesServer();
    await show(<PlaceholderEditScreen placeholderId="nope" templateId="t1" />);
    expect(await screen.findByText(PLACEHOLDER_MESSAGES.cantFind)).toBeTruthy();
  });

  it("tells a viewer why they can't edit", async () => {
    const server = startLeaseTemplatesServer();
    server.role = "viewer";
    await show(<PlaceholderEditScreen placeholderId="p1" templateId="t1" />);
    expect(await screen.findByText(FORM_MESSAGES.viewOnlyHeading)).toBeTruthy();
  });
});

describe("deleting a template", () => {
  async function pressDelete(): Promise<void> {
    await fireEvent.press(await screen.findByRole("button", { name: LEASE_TEMPLATE_MESSAGES.delete }));
    await pressAlertButton(alertSpy, LEASE_TEMPLATE_MESSAGES.delete, act);
  }

  it("asks first, then deletes and goes back", async () => {
    const server = startLeaseTemplatesServer();
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await fireEvent.press(await screen.findByRole("button", { name: LEASE_TEMPLATE_MESSAGES.delete }));
    expect(alertSpy.mock.calls.at(-1)?.[0]).toBe(deleteTemplateTitle("Standard lease"));
    expect(server.writes).toHaveLength(0);
    await pressAlertButton(alertSpy, LEASE_TEMPLATE_MESSAGES.delete, act);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(server.templates).toHaveLength(0);
  });

  it("says a template in use by leases can't be deleted, and stays", async () => {
    const server = startLeaseTemplatesServer();
    server.failNext.push({ match: "/lease-templates/t1", status: 409, detail: { code: "template_in_use", message: "dev text" }, once: true });
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await pressDelete();
    expect(await screen.findByText(LEASE_TEMPLATE_DELETE_COPY.inUse)).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("treats a template already deleted as done", async () => {
    const server = startLeaseTemplatesServer();
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByRole("button", { name: LEASE_TEMPLATE_MESSAGES.delete });
    server.templates = [];
    await fireEvent.press(screen.getByRole("button", { name: LEASE_TEMPLATE_MESSAGES.delete }));
    await pressAlertButton(alertSpy, LEASE_TEMPLATE_MESSAGES.delete, act);
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });

  it("doesn't offer delete to someone with view-only access", async () => {
    const server = startLeaseTemplatesServer();
    server.role = "viewer";
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText("Standard lease");
    await act(async () => undefined);
    expect(screen.queryByRole("button", { name: LEASE_TEMPLATE_MESSAGES.delete })).toBeNull();
  });
});
