import "../test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, screen } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import * as DocumentPicker from "expo-document-picker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Alert, type AlertButton, Text } from "react-native";
import { Provider } from "react-redux";
import { LEASE_IMPORT_MESSAGES as MESSAGES } from "../src/constants/leaseImport";
import LeaseImportScreen from "../src/features/leaseImport/LeaseImportScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { makeStore } from "../src/lib/store";
import { formParts, formValue } from "../test-support/applicantsServer";
import { File, resetFakeFiles } from "../test-support/fakeFileSystem";
import { holdWrites } from "../test-support/holdWrites";
import { type FakeLeaseWritesServer, lastRequest, roleKnown, startLeaseWritesServer } from "../test-support/leaseWritesServer";

jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(), launchCameraAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock("expo-image-manipulator", () => ({ SaveFormat: { JPEG: "jpeg" }, ImageManipulator: { manipulate: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return { __esModule: true, default: View, DateTimePickerAndroid: { open: jest.fn() } };
});
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));

const originalAdapter = api.defaults.adapter;
const alert = jest.spyOn(Alert, "alert");
let testStore: ReturnType<typeof makeStore>;

function LeasePage() {
  return <Text>{`lease-page-${useLocalSearchParams<{ id: string }>().id}`}</Text>;
}

async function openImport(): Promise<void> {
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
      "leases/import": LeaseImportScreen,
    },
    { initialUrl: "/" },
  );
  await act(async () => {
    router.push("/leases/import");
  });
}

function pickPdf(name: string): void {
  const source = new File(`cache:/DocumentPicker/${name}`);
  source.write("pdf");
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: source.uri, name, mimeType: "application/pdf" }],
  } as DocumentPicker.DocumentPickerResult);
}

async function addFile(name: string): Promise<void> {
  pickPdf(name);
  await fireEvent.press(screen.getByRole("button", { name: "Choose a file" }));
  await screen.findByText(name);
}

async function chooseApplicant(name: string): Promise<void> {
  await fireEvent.press(await screen.findByRole("button", { name: /^Who signed it\?/ }));
  await fireEvent.press(await screen.findByText(name));
}

async function chooseDate(label: string): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: `Choose ${label.toLowerCase()}` }));
  await fireEvent.press(screen.getByRole("button", { name: `Done choosing ${label.toLowerCase()}` }));
}

const importLease = async () => fireEvent.press(await screen.findByRole("button", { name: MESSAGES.submit }));
const imports = (server: FakeLeaseWritesServer) => server.requests.filter((request) => request.url === "/signed-leases/import");

function pressInAlert(text: string): void {
  const buttons = alert.mock.calls.at(-1)?.[2] as AlertButton[];
  buttons.find((button) => button.text === text)?.onPress?.();
}

beforeEach(() => {
  session.tokenStore.set("token");
  testStore = makeStore();
  testStore.dispatch(workspaceChosen("w1"));
  jest.mocked(DocumentPicker.getDocumentAsync).mockReset();
  resetFakeFiles();
  alert.mockReset();
  alert.mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  testStore.dispatch(baseApi.util.resetApiState());
});

describe("importing a signed lease", () => {
  it("sends who signed it, the dates, the notes and the files, then opens the lease", async () => {
    const server = startLeaseWritesServer();
    await openImport();
    await chooseApplicant("Sam Lee");
    await fireEvent.press(await screen.findByRole("button", { name: /^Listing/ }));
    await fireEvent.press(await screen.findByText("Back room"));
    await chooseDate(MESSAGES.startsOn);
    await chooseDate(MESSAGES.endsOn);
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.notes), "  Signed at the kitchen table ");
    await addFile("lease.pdf");
    await addFile("addendum.pdf");
    expect(screen.getByText(MESSAGES.signedLeaseTag)).toBeTruthy();
    await importLease();

    expect(await screen.findByText("lease-page-imported1")).toBeTruthy();
    expect(await screen.findByText("Lease imported with 0 files.")).toBeTruthy();
    const form = lastRequest(server, "post", "/signed-leases/import")?.data;
    expect(formValue(form, "applicant_id")).toBe("a2");
    expect(formValue(form, "listing_id")).toBe("li1");
    expect(formValue(form, "status")).toBe("signed");
    expect(formValue(form, "notes")).toBe("Signed at the kitchen table");
    expect(formValue(form, "starts_on")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formValue(form, "ends_on")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formParts(form).filter((part) => part.fieldName === "files").map((part) => part.name)).toEqual(["lease.pdf", "addendum.pdf"]);
  });

  it("leaves out what I didn't fill in", async () => {
    const server = startLeaseWritesServer();
    await openImport();
    await chooseApplicant("Dana Reed");
    await addFile("lease.pdf");
    await importLease();
    await screen.findByText("lease-page-imported1");
    const form = lastRequest(server, "post", "/signed-leases/import")?.data;
    expect(formValue(form, "applicant_id")).toBe("a1");
    for (const field of ["listing_id", "starts_on", "ends_on", "notes"]) expect(formValue(form, field)).toBeUndefined();
  });

  it("points at what's missing on its own field, and sends nothing", async () => {
    const server = startLeaseWritesServer();
    await openImport();
    await importLease();
    expect(await screen.findByText(MESSAGES.needTenant)).toBeTruthy();
    expect(screen.getByText(MESSAGES.needFiles)).toBeTruthy();
    expect(imports(server)).toHaveLength(0);
  });

  it("stops notes at 2000 characters", async () => {
    startLeaseWritesServer();
    await openImport();
    expect((await screen.findByLabelText(MESSAGES.notes)).props.maxLength).toBe(2000);
  });

  it("locks the dates while importing", async () => {
    startLeaseWritesServer();
    await openImport();
    await chooseApplicant("Dana Reed");
    await addFile("lease.pdf");
    holdWrites();
    await importLease();
    for (const name of ["Choose lease starts", "Choose lease ends"]) {
      expect(screen.getByRole("button", { name }).props.accessibilityState?.disabled).toBe(true);
    }
  });

  it("counts the characters left in the notes", async () => {
    startLeaseWritesServer();
    await openImport();
    expect(await screen.findByText("2000 characters left")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(MESSAGES.notes), "x".repeat(1999));
    expect(screen.getByText("1 character left")).toBeTruthy();
  });

  it("removes a file I chose", async () => {
    startLeaseWritesServer();
    await openImport();
    await screen.findByRole("button", { name: /^Who signed it\?/ });
    await addFile("lease.pdf");
    await fireEvent.press(screen.getByRole("button", { name: /^Remove lease\.pdf/ }));
    expect(screen.queryByText("lease.pdf")).toBeNull();
    expect(screen.getByText(MESSAGES.noFiles)).toBeTruthy();
  });

  it("shows it's working and imports once however many times it's tapped", async () => {
    const server = startLeaseWritesServer();
    await openImport();
    await chooseApplicant("Dana Reed");
    await addFile("lease.pdf");
    holdWrites();
    await importLease();
    expect(screen.getByText(MESSAGES.submitting)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.submitting }));
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.submitting }));
    expect(imports(server)).toHaveLength(0);
  });

  it.each([
    [{ status: 413 }, MESSAGES.tooBig],
    [{ status: 415 }, MESSAGES.badFile],
    [{ status: 503 }, MESSAGES.storageDown],
    [{ status: 404 }, MESSAGES.goneTenant],
    [{ status: 403 }, MESSAGES.viewOnly],
    [{ status: 500 }, MESSAGES.unsure],
    ["offline" as const, MESSAGES.unsure],
    [{ status: 422 }, MESSAGES.refused],
  ])("tells it in fixed words when the import fails (%j) and keeps what I filled in", async (failure, message) => {
    const server = startLeaseWritesServer();
    server.failures.import = failure;
    await openImport();
    await chooseApplicant("Dana Reed");
    await addFile("lease.pdf");
    await importLease();
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("A developer's message")).toBeNull();
    expect(screen.getByText("lease.pdf")).toBeTruthy();

    delete server.failures.import;
    await importLease();
    expect(await screen.findByText("lease-page-imported1")).toBeTruthy();
  });

  it("says so when there are no applicants", async () => {
    startLeaseWritesServer({ applicants: [] });
    await openImport();
    expect(await screen.findByText(MESSAGES.noTenants)).toBeTruthy();
  });

  it("doesn't call a failed applicants load empty, and tries again", async () => {
    const server = startLeaseWritesServer();
    server.failures.applicants = { status: 500 };
    await openImport();
    expect(await screen.findByText(MESSAGES.couldntLoadTenants)).toBeTruthy();
    delete server.failures.applicants;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByRole("button", { name: /^Who signed it\?/ })).toBeTruthy();
  });

  it("still lets me import when the listings can't load", async () => {
    const server = startLeaseWritesServer();
    server.failures.listings = { status: 500 };
    await openImport();
    expect(await screen.findByText(MESSAGES.listingsFailed)).toBeTruthy();
    await chooseApplicant("Dana Reed");
    await addFile("lease.pdf");
    await importLease();
    expect(await screen.findByText("lease-page-imported1")).toBeTruthy();
  });

  it("shows skeletons while the choices load", async () => {
    startLeaseWritesServer();
    const answer = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = (config) => (config.url === "/applicants" ? new Promise(() => undefined) : answer(config));
    await openImport();
    expect(await screen.findByLabelText(MESSAGES.loadingTenants)).toBeTruthy();
  });

  it("gives someone who can only read no form", async () => {
    const server = startLeaseWritesServer({ role: "viewer" });
    await openImport();
    await roleKnown(server);
    expect(await screen.findByText(MESSAGES.viewOnly)).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.submit })).toBeNull();
  });

  it("leaves freely when nothing was filled in, and asks before throwing away what I did", async () => {
    startLeaseWritesServer();
    await openImport();
    await screen.findByRole("button", { name: /^Who signed it\?/ });
    await act(async () => {
      router.back();
    });
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText("start-screen")).toBeTruthy();

    await act(async () => {
      router.push("/leases/import");
    });
    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.notes), "Something");
    await act(async () => {
      router.back();
    });
    expect(alert.mock.calls[0][0]).toBe("Discard your changes?");
    expect(screen.getByDisplayValue("Something")).toBeTruthy();
    await act(async () => pressInAlert("Discard"));
    expect(screen.getByText("start-screen")).toBeTruthy();
  });
});
