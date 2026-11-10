import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import LeaseTemplateUploadDialog from "@/app/features/leases/LeaseTemplateUploadDialog";
import { LEASE_TEMPLATE_CREATE_COPY } from "@mybookkeeper/api-client/constants/leaseTemplateCreateCopy";
import { LEASE_TEMPLATE_UPLOAD_PROBLEMS } from "@mybookkeeper/api-client/constants/leaseTemplateUpload";
import type { LeaseTemplateDetail } from "@mybookkeeper/api-client/types/lease/lease-template-detail";
import type { SuggestPlaceholdersResponse } from "@mybookkeeper/api-client/types/lease/suggest-placeholders-response";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const mockCreateMutation = vi.fn();
const mockSuggestMutation = vi.fn();

vi.mock("@mybookkeeper/api-client/store/leaseTemplatesApi", () => ({
  useCreateLeaseTemplateMutation: vi.fn(() => [
    mockCreateMutation,
    { isLoading: false },
  ]),
  useSuggestPlaceholdersMutation: vi.fn(() => [
    mockSuggestMutation,
    { isLoading: false },
  ]),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _buildTemplate(id = "tpl-1"): LeaseTemplateDetail {
  return {
    id,
    user_id: "user-1",
    organization_id: "org-1",
    name: "Test Lease",
    description: null,
    version: 1,
    files: [],
    placeholders: [],
    created_at: "2026-05-03T00:00:00Z",
    updated_at: "2026-05-03T00:00:00Z",
  };
}

function _buildSuggestions(): SuggestPlaceholdersResponse {
  return {
    suggestions: [
      {
        key: "TENANT FULL NAME",
        description: "Legal name of the tenant.",
        input_type: "text",
      },
    ],
    truncated: false,
    pages_note: null,
  };
}

function renderDialog(props: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: (
    template: LeaseTemplateDetail,
    aiSuggestions: SuggestPlaceholdersResponse | null,
  ) => void;
}) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <LeaseTemplateUploadDialog
          open={props.open ?? true}
          onOpenChange={props.onOpenChange ?? vi.fn()}
          onCreated={props.onCreated}
        />
      </MemoryRouter>
    </Provider>,
  );
}

/** Find and submit the upload form directly (bypasses HTML5 native validation in JSDOM). */
function submitForm() {
  const form = document
    .querySelector("[data-testid='lease-template-upload-dialog'] form") as HTMLFormElement;
  fireEvent.submit(form);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LeaseTemplateUploadDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the upload form when open", () => {
    renderDialog({});
    expect(
      screen.getByTestId("lease-template-upload-dialog"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("template-name-input")).toBeInTheDocument();
    expect(screen.getByTestId("template-file-dropzone")).toBeInTheDocument();
  });

  it("shows error when submitting without a name", async () => {
    const { showError } = await import("@platform/ui");
    renderDialog({});
    // Submit without entering a name.
    submitForm();
    expect(showError).toHaveBeenCalledWith("Please name this template.");
  });

  it("shows error when submitting without files", async () => {
    const { showError } = await import("@platform/ui");
    renderDialog({});
    fireEvent.change(screen.getByTestId("template-name-input"), {
      target: { value: "My Lease" },
    });
    submitForm();
    expect(showError).toHaveBeenCalledWith("Please add at least one file.");
  });

  it("shows AI suggesting loader after successful upload, then calls onCreated with suggestions", async () => {
    const template = _buildTemplate();
    const suggestions = _buildSuggestions();

    // Mock createTemplate to resolve with the template.
    mockCreateMutation.mockImplementation(() => ({
      unwrap: () => Promise.resolve(template),
    }));
    // Hold suggestPlaceholders open so the loader is observable before it resolves.
    let resolveSuggest: (value: SuggestPlaceholdersResponse) => void = () => {};
    mockSuggestMutation.mockImplementation(() => ({
      unwrap: () =>
        new Promise<SuggestPlaceholdersResponse>((resolve) => {
          resolveSuggest = resolve;
        }),
    }));

    const onCreated = vi.fn();
    renderDialog({ onCreated });

    // Fill out form name.
    fireEvent.change(screen.getByTestId("template-name-input"), {
      target: { value: "My Lease" },
    });

    // Simulate file drop to add a file.
    const file = new File(["[TENANT NAME]"], "lease.md", {
      type: "text/markdown",
    });
    fireEvent.drop(screen.getByTestId("template-file-dropzone"), {
      dataTransfer: { files: [file] },
    });

    submitForm();

    // After create resolves, the AI loader appears.
    await waitFor(() => {
      expect(screen.getByTestId("ai-suggesting-loader")).toBeInTheDocument();
    });
    expect(onCreated).not.toHaveBeenCalled();

    resolveSuggest(suggestions);

    // After AI resolves, onCreated is called with template + suggestions.
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(template, suggestions);
    });
  });

  it("calls onCreated with null suggestions when AI fails", async () => {
    const template = _buildTemplate();

    mockCreateMutation.mockImplementation(() => ({
      unwrap: () => Promise.resolve(template),
    }));
    mockSuggestMutation.mockImplementation(() => ({
      unwrap: () => Promise.reject(new Error("AI unavailable")),
    }));

    const onCreated = vi.fn();
    renderDialog({ onCreated });

    fireEvent.change(screen.getByTestId("template-name-input"), {
      target: { value: "My Lease" },
    });

    const file = new File(["content"], "lease.md", { type: "text/markdown" });
    fireEvent.drop(screen.getByTestId("template-file-dropzone"), {
      dataTransfer: { files: [file] },
    });

    submitForm();

    await waitFor(() => {
      // AI failure is swallowed — onCreated still called with null suggestions.
      expect(onCreated).toHaveBeenCalledWith(template, null);
    });
  });

  async function fillAndSubmit(file: File) {
    fireEvent.change(screen.getByTestId("template-name-input"), { target: { value: "My Lease" } });
    fireEvent.drop(screen.getByTestId("template-file-dropzone"), { dataTransfer: { files: [file] } });
    submitForm();
  }

  it("refuses a file over 25 MB before sending anything", async () => {
    const { showError } = await import("@platform/ui");
    renderDialog({});
    const big = new File(["x"], "big.docx");
    Object.defineProperty(big, "size", { value: 26 * 1024 * 1024 });
    await fillAndSubmit(big);
    expect(showError).toHaveBeenCalledWith(LEASE_TEMPLATE_UPLOAD_PROBLEMS.file_too_big);
    expect(mockCreateMutation).not.toHaveBeenCalled();
  });

  it("refuses files that are too large together before sending anything", async () => {
    const { showError } = await import("@platform/ui");
    renderDialog({});
    const first = new File(["x"], "a.docx");
    const second = new File(["x"], "b.docx");
    Object.defineProperty(first, "size", { value: 20 * 1024 * 1024 });
    Object.defineProperty(second, "size", { value: 20 * 1024 * 1024 });
    fireEvent.change(screen.getByTestId("template-name-input"), { target: { value: "My Lease" } });
    fireEvent.drop(screen.getByTestId("template-file-dropzone"), { dataTransfer: { files: [first, second] } });
    submitForm();
    expect(showError).toHaveBeenCalledWith(LEASE_TEMPLATE_UPLOAD_PROBLEMS.files_too_big_together);
    expect(mockCreateMutation).not.toHaveBeenCalled();
  });

  it("says it may have saved when the upload times out, so a retry doesn't make a second template", async () => {
    const { showError } = await import("@platform/ui");
    mockCreateMutation.mockImplementation(() => ({ unwrap: () => Promise.reject(new Error("timeout of 300000ms exceeded")) }));
    renderDialog({});
    await fillAndSubmit(new File(["x"], "lease.md", { type: "text/markdown" }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith(LEASE_TEMPLATE_CREATE_COPY.noResponse));
  });

  it("says the files are too large to send together when the proxy refuses with no message", async () => {
    const { showError } = await import("@platform/ui");
    mockCreateMutation.mockImplementation(() => ({ unwrap: () => Promise.reject({ status: 413, data: "" }) }));
    renderDialog({});
    await fillAndSubmit(new File(["x"], "lease.md", { type: "text/markdown" }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith(LEASE_TEMPLATE_CREATE_COPY.tooBigTogether));
  });

  it("shows the server's sentence naming a file that is too big", async () => {
    const { showError } = await import("@platform/ui");
    mockCreateMutation.mockImplementation(() => ({ unwrap: () => Promise.reject({ status: 413, data: { detail: "lease.md exceeds 25MB limit" } }) }));
    renderDialog({});
    await fillAndSubmit(new File(["x"], "lease.md", { type: "text/markdown" }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith("lease.md exceeds 25MB limit"));
  });

  it("does not render when closed", () => {
    renderDialog({ open: false });
    expect(
      screen.queryByTestId("lease-template-upload-dialog"),
    ).not.toBeInTheDocument();
  });
});
