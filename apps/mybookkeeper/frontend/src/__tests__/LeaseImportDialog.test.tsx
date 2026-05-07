import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "@/shared/store";
import LeaseImportDialog from "@/app/features/leases/LeaseImportDialog";
import type { ApplicantListResponse } from "@/shared/types/applicant/applicant-list-response";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: vi.fn(() => vi.fn()) };
});

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const mockImportMutation = vi.fn();
vi.mock("@/shared/store/signedLeasesApi", () => ({
  useImportSignedLeaseMutation: vi.fn(() => [mockImportMutation, { isLoading: false }]),
}));

vi.mock("@/shared/store/applicantsApi", () => ({
  useGetApplicantsQuery: vi.fn(() => ({
    data: {
      items: [
        {
          id: "app-1",
          organization_id: "org-1",
          user_id: "user-1",
          inquiry_id: null,
          legal_name: "Jane Doe",
          employer_or_hospital: null,
          contract_start: null,
          contract_end: null,
          stage: "lead",
          tenant_ended_at: null,
          tenant_ended_reason: null,
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-01T00:00:00Z",
        } satisfies ApplicantSummary,
      ],
      total: 1,
      has_more: false,
    } satisfies ApplicantListResponse,
    isLoading: false,
  })),
}));

vi.mock("@/shared/store/listingsApi", () => ({
  useGetListingsQuery: vi.fn(() => ({
    data: { items: [], total: 0, has_more: false },
    isLoading: false,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(onClose = vi.fn()) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <LeaseImportDialog onClose={onClose} />
      </MemoryRouter>
    </Provider>,
  );
}

function makeFile(name: string, type = "application/pdf"): File {
  return new File([new Uint8Array([37, 80, 68, 70])], name, { type });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LeaseImportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImportMutation.mockReset();
  });

  it("renders the dialog with required elements", () => {
    renderDialog();
    expect(screen.getByTestId("lease-import-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("import-applicant-select")).toBeInTheDocument();
    expect(screen.getByTestId("import-file-drop-zone")).toBeInTheDocument();
    expect(screen.getByTestId("import-submit")).toBeInTheDocument();
  });

  it("submit button is disabled when no applicant selected", () => {
    renderDialog();
    const submitBtn = screen.getByTestId("import-submit");
    // No applicant and no file — should be disabled.
    expect(submitBtn).toBeDisabled();
  });

  it("submit button is disabled when applicant selected but no files", () => {
    renderDialog();
    const select = screen.getByTestId("import-applicant-select");
    fireEvent.change(select, { target: { value: "app-1" } });
    const submitBtn = screen.getByTestId("import-submit");
    expect(submitBtn).toBeDisabled();
  });

  it("submit button is enabled when applicant + file selected", () => {
    renderDialog();
    const select = screen.getByTestId("import-applicant-select");
    fireEvent.change(select, { target: { value: "app-1" } });

    const fileInput = screen.getByTestId("import-file-input");
    fireEvent.change(fileInput, {
      target: { files: [makeFile("lease.pdf")] },
    });

    const submitBtn = screen.getByTestId("import-submit");
    expect(submitBtn).not.toBeDisabled();
  });

  it("calls importLease mutation on submit with correct payload", async () => {
    mockImportMutation.mockResolvedValueOnce({
      data: {
        id: "lease-1",
        attachments: [{ id: "att-1" }],
        kind: "imported",
        status: "signed",
        templates: [],
      },
      unwrap: async () => ({
        id: "lease-1",
        attachments: [{ id: "att-1" }],
        kind: "imported",
        status: "signed",
        templates: [],
      }),
    });

    // RTK mutations return { unwrap } — mock that properly.
    mockImportMutation.mockImplementation(() => ({
      unwrap: vi.fn().mockResolvedValue({
        id: "lease-1",
        attachments: [{ id: "att-1" }],
        kind: "imported",
        status: "signed",
        templates: [],
      }),
    }));

    renderDialog();
    const select = screen.getByTestId("import-applicant-select");
    fireEvent.change(select, { target: { value: "app-1" } });

    const fileInput = screen.getByTestId("import-file-input");
    const file = makeFile("lease.pdf");
    fireEvent.change(fileInput, { target: { files: [file] } });

    const form = screen.getByTestId("lease-import-form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockImportMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          applicant_id: "app-1",
          status: "signed",
          files: expect.arrayContaining([file]),
        }),
      );
    });
  });

  it("shows error toast when import fails", async () => {
    const { showError } = await import("@/shared/lib/toast-store");

    mockImportMutation.mockImplementation(() => ({
      unwrap: vi.fn().mockRejectedValue(new Error("500 Internal Server Error")),
    }));

    renderDialog();
    const select = screen.getByTestId("import-applicant-select");
    fireEvent.change(select, { target: { value: "app-1" } });

    const fileInput = screen.getByTestId("import-file-input");
    fireEvent.change(fileInput, { target: { files: [makeFile("lease.pdf")] } });

    const form = screen.getByTestId("lease-import-form");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(showError).toHaveBeenCalled();
    });
  });

  it("calls onClose when cancel is clicked", () => {
    const onClose = vi.fn();
    renderDialog(onClose);
    const cancelBtn = screen.getByTestId("import-cancel");
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows file chips after files are selected", () => {
    renderDialog();
    const fileInput = screen.getByTestId("import-file-input");
    fireEvent.change(fileInput, {
      target: { files: [makeFile("lease.pdf"), makeFile("inspection.pdf")] },
    });
    expect(screen.getByTestId("import-file-list")).toBeInTheDocument();
    expect(screen.getByText("lease.pdf")).toBeInTheDocument();
    expect(screen.getByText("inspection.pdf")).toBeInTheDocument();
  });

  it("removes a file when remove button is clicked", () => {
    renderDialog();
    const fileInput = screen.getByTestId("import-file-input");
    fireEvent.change(fileInput, {
      target: { files: [makeFile("lease.pdf")] },
    });
    expect(screen.getByText("lease.pdf")).toBeInTheDocument();

    const removeBtn = screen.getByTestId("import-remove-file-0");
    fireEvent.click(removeBtn);
    expect(screen.queryByText("lease.pdf")).not.toBeInTheDocument();
  });
});
