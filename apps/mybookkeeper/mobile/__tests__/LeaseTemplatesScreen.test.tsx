import { leaseTemplatesApi } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import type { LeaseTemplateDetail } from "@mybookkeeper/api-client/types/lease/lease-template-detail";
import type { LeaseTemplateFile } from "@mybookkeeper/api-client/types/lease/lease-template-file";
import type { LeaseTemplatePlaceholder } from "@mybookkeeper/api-client/types/lease/lease-template-placeholder";
import type { LeaseTemplateSummary } from "@mybookkeeper/api-client/types/lease/lease-template-summary";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import type { ReactElement } from "react";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import { WEB_BASE_URL } from "../src/constants/api";
import { LEASE_TEMPLATE_MESSAGES } from "../src/constants/leaseTemplates";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { openAttachmentFile } from "../src/features/documents/openDocumentFile";
import { inDisplayOrder, placeholdersLine, templateCountsLine, templateFileLine, templateRowLabel } from "../src/features/leaseTemplates/leaseTemplateDisplay";
import LeaseTemplateDetailScreen from "../src/features/leaseTemplates/LeaseTemplateDetailScreen";
import LeaseTemplatesScreen from "../src/features/leaseTemplates/LeaseTemplatesScreen";
import { store } from "../src/lib/store";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: () => mockBack() },
}));

jest.mock("../src/features/documents/openDocumentFile", () => ({
  openAttachmentFile: jest.fn(),
  clearDocumentFiles: jest.fn(),
}));

const mockOpenFile = jest.mocked(openAttachmentFile);
const originalAdapter = api.defaults.adapter;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function aSummary(overrides: Partial<LeaseTemplateSummary> = {}): LeaseTemplateSummary {
  return {
    id: "t1",
    user_id: "u",
    organization_id: "o",
    name: "Standard lease",
    description: "For the Oak Street rooms",
    version: 3,
    file_count: 2,
    placeholder_count: 14,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-11-03T12:00:00Z",
    ...overrides,
  };
}

function aFile(overrides: Partial<LeaseTemplateFile> = {}): LeaseTemplateFile {
  return {
    id: "f1",
    template_id: "t1",
    filename: "lease.docx",
    storage_key: "secret/storage/key",
    content_type: DOCX,
    size_bytes: 245760,
    display_order: 0,
    created_at: "2026-01-01T12:00:00Z",
    presigned_url: "https://files.example/lease.docx",
    is_available: true,
    ...overrides,
  };
}

function aPlaceholder(id: string): LeaseTemplatePlaceholder {
  return {
    id,
    template_id: "t1",
    key: `KEY_${id}`,
    display_label: `Label ${id}`,
    input_type: "text",
    required: true,
    default_source: null,
    computed_expr: null,
    display_order: 0,
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-01-01T12:00:00Z",
  };
}

function aTemplate(overrides: Partial<LeaseTemplateDetail> = {}): LeaseTemplateDetail {
  return {
    id: "t1",
    user_id: "u",
    organization_id: "o",
    name: "Standard lease",
    description: "For the Oak Street rooms",
    version: 3,
    files: [aFile()],
    placeholders: [aPlaceholder("p1"), aPlaceholder("p2")],
    created_at: "2026-01-01T12:00:00Z",
    updated_at: "2026-11-03T12:00:00Z",
    ...overrides,
  };
}

function aPage(items: LeaseTemplateSummary[], hasMore = false) {
  return { items, total: items.length, has_more: hasMore };
}

function startServer(list: unknown, detail: unknown = aTemplate()) {
  const server = { list, detail, listParams: undefined as unknown, detailCalls: 0 };
  const adapter: AxiosAdapter = async (config) => {
    const isList = config.url === "/lease-templates";
    if (isList) server.listParams = config.params;
    else server.detailCalls += 1;
    const answer = isList ? server.list : server.detail;
    if (answer === "hold") return new Promise(() => undefined);
    if (answer === "fail") return Promise.reject({ response: { status: 500, data: {} }, config, isAxiosError: true });
    if (answer === "gone") return Promise.reject({ response: { status: 404, data: {} }, config, isAxiosError: true });
    return { data: answer, status: 200, statusText: "OK", headers: {}, config };
  };
  api.defaults.adapter = adapter;
  return server;
}

async function show(element: ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch(baseApi.util.resetApiState());
  mockPush.mockClear();
  mockBack.mockClear();
  mockOpenFile.mockReset();
  mockOpenFile.mockResolvedValue(undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("lease template wording", () => {
  it("counts files and placeholders in the singular and the plural", () => {
    expect(templateCountsLine({ file_count: 1, placeholder_count: 1 })).toBe("1 file, 1 placeholder");
    expect(templateCountsLine({ file_count: 2, placeholder_count: 0 })).toBe("2 files, 0 placeholders");
  });

  it("reads a row out with or without a description", () => {
    expect(templateRowLabel(aSummary())).toBe("Standard lease. For the Oak Street rooms, 2 files, 14 placeholders");
    expect(templateRowLabel(aSummary({ description: null }))).toBe("Standard lease. 2 files, 14 placeholders");
  });

  it("names each kind of file that can be uploaded, and just the size for anything else", () => {
    expect(templateFileLine({ content_type: DOCX, size_bytes: 1536 })).toBe("Word document, 1.5 KB");
    expect(templateFileLine({ content_type: "text/markdown", size_bytes: 512 })).toBe("Markdown, 512 B");
    expect(templateFileLine({ content_type: "text/plain", size_bytes: 512 })).toBe("Text file, 512 B");
    expect(templateFileLine({ content_type: "application/octet-stream", size_bytes: 512 })).toBe("512 B");
  });

  it("describes placeholders by how many there are", () => {
    expect(placeholdersLine(0)).toBe(LEASE_TEMPLATE_MESSAGES.noPlaceholders);
    expect(placeholdersLine(1)).toBe("This template has 1 placeholder that gets filled in when you make a lease on the website.");
    expect(placeholdersLine(14)).toBe("This template has 14 placeholders that get filled in when you make a lease on the website.");
  });

  it("puts files in their display order without touching the cached list", () => {
    const files = [aFile({ id: "b", display_order: 1 }), aFile({ id: "a", display_order: 0 })];
    expect(inDisplayOrder(files).map((file) => file.id)).toEqual(["a", "b"]);
    expect(files[0]?.id).toBe("b");
  });
});

describe("LeaseTemplatesScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer("hold");
    await show(<LeaseTemplatesScreen />);
    expect(await screen.findByTestId("lease-templates-skeleton")).toBeTruthy();
  });

  it("asks for as many as the server allows, lists them, and opens one", async () => {
    const server = startServer(aPage([aSummary()]));
    await show(<LeaseTemplatesScreen />);
    await screen.findByText("Standard lease");
    expect(server.listParams).toEqual({ limit: 100 });
    expect(screen.getByText("For the Oak Street rooms")).toBeTruthy();
    expect(screen.getByText("2 files, 14 placeholders")).toBeTruthy();
    expect(screen.getByText(LEASE_TEMPLATE_MESSAGES.manageOnWebsite)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Standard lease. For the Oak Street rooms, 2 files, 14 placeholders" }));
    expect(mockPush).toHaveBeenCalledWith("/lease-templates/t1");
  });

  it("says when there are more than it shows, and links to all of them", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    startServer(aPage([aSummary()], true));
    await show(<LeaseTemplatesScreen />);
    await screen.findByText(LEASE_TEMPLATE_MESSAGES.moreOnWebsite);
    expect(screen.queryByText(LEASE_TEMPLATE_MESSAGES.manageOnWebsite)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: LEASE_TEMPLATE_MESSAGES.openListOnWebsite }));
    expect(openURL).toHaveBeenCalledWith(`${WEB_BASE_URL}/lease-templates`);
  });

  it("points to the website when there are none", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    startServer(aPage([]));
    await show(<LeaseTemplatesScreen />);
    await screen.findByText(LEASE_TEMPLATE_MESSAGES.noneHeading);
    expect(screen.getByText(LEASE_TEMPLATE_MESSAGES.noneBody)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: LEASE_TEMPLATE_MESSAGES.openWebsite }));
    expect(openURL).toHaveBeenCalledWith(`${WEB_BASE_URL}/lease-templates`);
  });

  it("keeps saying there are none during a reload", async () => {
    const server = startServer(aPage([]));
    await show(<LeaseTemplatesScreen />);
    await screen.findByText(LEASE_TEMPLATE_MESSAGES.noneHeading);
    server.list = "hold";
    await act(async () => {
      void screen.getByTestId("lease-templates-list").props.refreshControl.props.onRefresh();
    });
    expect(screen.getByText(LEASE_TEMPLATE_MESSAGES.noneHeading)).toBeTruthy();
    expect(screen.queryByTestId("lease-templates-skeleton")).toBeNull();
  });

  it("offers a retry when the first load fails, not 'none', and recovers", async () => {
    const server = startServer("fail");
    await show(<LeaseTemplatesScreen />);
    await screen.findByText(LEASE_TEMPLATE_MESSAGES.couldntLoadList);
    expect(screen.queryByText(LEASE_TEMPLATE_MESSAGES.noneHeading)).toBeNull();
    server.list = aPage([aSummary()]);
    await fireEvent.press(screen.getByRole("button", { name: LEASE_TEMPLATE_MESSAGES.tryAgain }));
    await screen.findByText("Standard lease");
  });

  it("keeps what it had and says so when a pull to refresh fails", async () => {
    const server = startServer(aPage([aSummary()]));
    await show(<LeaseTemplatesScreen />);
    await screen.findByText("Standard lease");
    server.list = "fail";
    await act(async () => {
      await screen.getByTestId("lease-templates-list").props.refreshControl.props.onRefresh();
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Standard lease")).toBeTruthy();
  });
});

describe("LeaseTemplateDetailScreen", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startServer(aPage([]), "hold");
    await show(<LeaseTemplateDetailScreen id="t1" />);
    expect(await screen.findByTestId("lease-template-detail-skeleton")).toBeTruthy();
  });

  it("shows the template without its storage details or placeholder list", async () => {
    startServer(aPage([]));
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText("Standard lease");
    expect(screen.getByText("Version 3")).toBeTruthy();
    expect(screen.getByText("For the Oak Street rooms").props.selectable).toBe(true);
    expect(screen.getByText("lease.docx")).toBeTruthy();
    expect(screen.getByText("Word document, 240.0 KB")).toBeTruthy();
    expect(screen.getByText(placeholdersLine(2))).toBeTruthy();
    expect(screen.queryByText("secret/storage/key")).toBeNull();
    expect(screen.queryByText("Label p1")).toBeNull();
    expect(screen.getByRole("header", { name: LEASE_TEMPLATE_MESSAGES.files })).toBeTruthy();
    expect(screen.getByRole("header", { name: LEASE_TEMPLATE_MESSAGES.placeholders })).toBeTruthy();
  });

  it("leaves out a missing description, and says when there are no files or placeholders", async () => {
    startServer(aPage([]), aTemplate({ description: null, files: [], placeholders: [] }));
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText(LEASE_TEMPLATE_MESSAGES.noFiles);
    expect(screen.getByText(LEASE_TEMPLATE_MESSAGES.noPlaceholders)).toBeTruthy();
    expect(screen.queryByText("For the Oak Street rooms")).toBeNull();
  });

  it("opens a file with a fresh link, not the one the page loaded with", async () => {
    const server = startServer(aPage([]));
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText("lease.docx");
    server.detail = aTemplate({ files: [aFile({ presigned_url: "https://files.example/fresh" })] });
    await fireEvent.press(screen.getByRole("button", { name: "Open lease.docx" }));
    await act(async () => undefined);
    expect(mockOpenFile).toHaveBeenCalledWith("https://files.example/fresh", expect.objectContaining({ id: "f1", filename: "lease.docx" }));
  });

  it("holds the other files back and shows progress while one opens", async () => {
    let finish = () => undefined as void;
    mockOpenFile.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    startServer(aPage([]), aTemplate({ files: [aFile(), aFile({ id: "f2", filename: "rider.docx", display_order: 1 })] }));
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText("rider.docx");
    await fireEvent.press(screen.getByRole("button", { name: "Open lease.docx" }));
    await act(async () => undefined);
    expect(mockOpenFile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Open rider.docx" }).props.accessibilityState.disabled).toBe(true);
    await act(async () => finish());
    expect(screen.getByRole("button", { name: "Open rider.docx" }).props.accessibilityState.disabled).toBeFalsy();
  });

  it("says so when a file won't open", async () => {
    mockOpenFile.mockRejectedValue(new Error("no"));
    startServer(aPage([]));
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Open lease.docx" }));
    await screen.findByText(LEASE_TEMPLATE_MESSAGES.couldntOpen);
  });

  it("says when a file has no link for now, and offers no button for it", async () => {
    startServer(aPage([]), aTemplate({ files: [aFile({ presigned_url: null })] }));
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText(LEASE_TEMPLATE_MESSAGES.noFileLink);
    expect(screen.queryByText(LEASE_TEMPLATE_MESSAGES.fileMissing)).toBeNull();
    expect(screen.queryByRole("button", { name: "Open lease.docx" })).toBeNull();
  });

  it("doesn't suggest waiting for a file that is gone from storage", async () => {
    startServer(aPage([]), aTemplate({ files: [aFile({ presigned_url: null, is_available: false })] }));
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText(LEASE_TEMPLATE_MESSAGES.fileMissing);
    expect(screen.queryByText(LEASE_TEMPLATE_MESSAGES.noFileLink)).toBeNull();
    expect(screen.queryByRole("button", { name: "Open lease.docx" })).toBeNull();
  });

  it("says it couldn't open a file that was replaced while the page was open, and shows the new one", async () => {
    const server = startServer(aPage([]));
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText("lease.docx");
    server.detail = aTemplate({ files: [aFile({ id: "f9", filename: "new-lease.docx" })] });
    await fireEvent.press(screen.getByRole("button", { name: "Open lease.docx" }));
    await screen.findByText(LEASE_TEMPLATE_MESSAGES.couldntOpen);
    expect(mockOpenFile).not.toHaveBeenCalled();
    expect(screen.getByText("new-lease.docx")).toBeTruthy();
  });

  it("says the template is gone when it was deleted before a file was opened", async () => {
    const server = startServer(aPage([]));
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText("lease.docx");
    server.detail = "gone";
    await fireEvent.press(screen.getByRole("button", { name: "Open lease.docx" }));
    await screen.findByText(LEASE_TEMPLATE_MESSAGES.cantFind);
    expect(mockOpenFile).not.toHaveBeenCalled();
  });

  it("links to this template on the website", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    startServer(aPage([]));
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await fireEvent.press(await screen.findByRole("button", { name: LEASE_TEMPLATE_MESSAGES.openOneOnWebsite }));
    expect(openURL).toHaveBeenCalledWith(`${WEB_BASE_URL}/lease-templates/t1`);
  });

  it("says when the template is gone, and offers a way back", async () => {
    startServer(aPage([]), "gone");
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText(LEASE_TEMPLATE_MESSAGES.cantFind);
    await fireEvent.press(screen.getByRole("button", { name: LEASE_TEMPLATE_MESSAGES.back }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("stops offering a template that was deleted while it was open", async () => {
    const server = startServer(aPage([]));
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText("lease.docx");
    server.detail = "gone";
    await act(async () => {
      await store.dispatch(leaseTemplatesApi.endpoints.getLeaseTemplateById.initiate("t1", { forceRefetch: true }));
    });
    await screen.findByText(LEASE_TEMPLATE_MESSAGES.cantFind);
    expect(screen.queryByText("lease.docx")).toBeNull();
  });

  it("offers a retry when it couldn't load, and recovers", async () => {
    const server = startServer(aPage([]), "fail");
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText(LEASE_TEMPLATE_MESSAGES.couldntLoadOne);
    server.detail = aTemplate();
    await fireEvent.press(screen.getByRole("button", { name: LEASE_TEMPLATE_MESSAGES.tryAgain }));
    await screen.findByText("lease.docx");
  });

  it("keeps what it had and says so when a pull to refresh fails", async () => {
    const server = startServer(aPage([]));
    await show(<LeaseTemplateDetailScreen id="t1" />);
    await screen.findByText("lease.docx");
    server.detail = "fail";
    await act(async () => {
      await screen.getByTestId("lease-template-detail").props.refreshControl.props.onRefresh();
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("lease.docx")).toBeTruthy();
  });
});
