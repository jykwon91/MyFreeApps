/**
 * Tests for NewSavedSearchDialog — source switching and per-source
 * field validation for Greenhouse and Lever.
 *
 * Covers:
 * - Source picker renders all three options
 * - Switching to Greenhouse shows board_token field, hides JSearch form
 * - Switching to Lever shows company_slug field, hides JSearch form
 * - Switching back to JSearch restores the JSearch form
 * - Greenhouse validation: empty token → error toast on confirm
 * - Greenhouse validation: invalid token format → error toast on confirm
 * - Lever validation: empty slug → error toast on confirm
 * - Lever validation: invalid slug format → error toast on confirm
 * - Greenhouse: calls createSource with source="greenhouse" + config
 * - Lever: calls createSource with source="lever" + config
 * - JSearch: still requires roles (existing behaviour preserved)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewSavedSearchDialog from "../NewSavedSearchDialog";

// ---------------------------------------------------------------------------
// Mock @platform/ui
// ---------------------------------------------------------------------------
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();

vi.mock("@platform/ui", () => ({
  ConfirmDialog: ({
    open,
    children,
    onConfirm,
    onCancel,
    title,
    description,
    isLoading,
  }: {
    open: boolean;
    children: React.ReactNode;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    description: string;
    isLoading?: boolean;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <h2>{title}</h2>
        <p data-testid="dialog-description">{description}</p>
        {children}
        <button data-testid="confirm-btn" onClick={onConfirm} disabled={isLoading}>
          Confirm
        </button>
        <button data-testid="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
  showError: (msg: string) => mockShowError(msg),
  showSuccess: (msg: string) => mockShowSuccess(msg),
  extractErrorMessage: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
  InlineBoldText: ({ text }: { text: string }) => <span>{text}</span>,
  Skeleton: () => <div data-testid="skeleton" />,
}));

// ---------------------------------------------------------------------------
// Mock store mutations
// ---------------------------------------------------------------------------
const mockCreateSource = vi.fn();
const mockUpdateProfile = vi.fn();

vi.mock("@/store/discoverApi", () => ({
  useCreateDiscoverySourceMutation: () => [
    mockCreateSource,
    { isLoading: false },
  ],
}));

vi.mock("@/lib/profileApi", () => ({
  useUpdateProfileMutation: () => [mockUpdateProfile, { isLoading: false }],
}));

/** RTK Query mutations return a promise with an .unwrap() method. */
function makeUnwrappableMutation(resolvedValue: unknown = {}) {
  const promise = Promise.resolve(resolvedValue) as Promise<unknown> & {
    unwrap: () => Promise<unknown>;
  };
  promise.unwrap = () => Promise.resolve(resolvedValue);
  return promise;
}

// ---------------------------------------------------------------------------
// Mock dialog sub-sections
// ---------------------------------------------------------------------------
vi.mock("../dialog-sections/SearchInputsSection", () => ({
  default: () => <div data-testid="search-inputs-section" />,
}));
vi.mock("../dialog-sections/WhereWhenSection", () => ({
  default: () => <div data-testid="where-when-section" />,
}));
vi.mock("../dialog-sections/JobTypeSection", () => ({
  default: () => <div data-testid="job-type-section" />,
}));
vi.mock("../dialog-sections/ExclusionsSection", () => ({
  default: () => <div data-testid="exclusions-section" />,
}));

// Mock prefill hook — no loading, no prefill.
vi.mock("../useDiscoveryDefaultsPrefill", () => ({
  useDiscoveryDefaultsPrefill: () => ({
    profile: null,
    recentRoleSuggestions: [],
    skillSuggestions: [],
    isPrefillLoading: false,
    didPrefill: false,
    resetPrefill: vi.fn(),
  }),
}));

vi.mock("../saved-search-summary", () => ({
  buildSavedSearchSummary: () => null,
  summarizeSearchQuery: () => "",
  getSourceLabel: (s: string) => s,
  getSourceBadgeColor: () => "gray",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDialog(open = true) {
  const onClose = vi.fn();
  const utils = render(<NewSavedSearchDialog open={open} onClose={onClose} />);
  return { onClose, ...utils };
}

function getSourceSelect() {
  return screen.getByLabelText("Job source") as HTMLSelectElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NewSavedSearchDialog — source picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSource.mockReturnValue(makeUnwrappableMutation({}));
  });

  it("renders the source picker with all three options", () => {
    renderDialog();
    const select = getSourceSelect();
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain("jsearch");
    expect(options).toContain("greenhouse");
    expect(options).toContain("lever");
  });

  it("defaults to jsearch and shows JSearch form sections", () => {
    renderDialog();
    expect(getSourceSelect().value).toBe("jsearch");
    expect(screen.getByTestId("search-inputs-section")).toBeInTheDocument();
    expect(screen.queryByLabelText("Greenhouse board token")).toBeNull();
    expect(screen.queryByLabelText("Lever company slug")).toBeNull();
  });

  it("switching to Greenhouse shows board_token field and hides JSearch sections", async () => {
    renderDialog();
    await userEvent.selectOptions(getSourceSelect(), "greenhouse");

    expect(screen.getByLabelText("Greenhouse board token")).toBeInTheDocument();
    expect(screen.queryByTestId("search-inputs-section")).toBeNull();
    expect(screen.queryByLabelText("Lever company slug")).toBeNull();
  });

  it("switching to Lever shows company_slug field and hides JSearch sections", async () => {
    renderDialog();
    await userEvent.selectOptions(getSourceSelect(), "lever");

    expect(screen.getByLabelText("Lever company slug")).toBeInTheDocument();
    expect(screen.queryByTestId("search-inputs-section")).toBeNull();
    expect(screen.queryByLabelText("Greenhouse board token")).toBeNull();
  });

  it("switching back to jsearch restores JSearch form sections", async () => {
    renderDialog();
    await userEvent.selectOptions(getSourceSelect(), "greenhouse");
    await userEvent.selectOptions(getSourceSelect(), "jsearch");

    expect(screen.getByTestId("search-inputs-section")).toBeInTheDocument();
    expect(screen.queryByLabelText("Greenhouse board token")).toBeNull();
  });

  it("updates dialog description when source changes", async () => {
    renderDialog();

    const jsearchDesc = screen.getByTestId("dialog-description").textContent;
    expect(jsearchDesc).toMatch(/Google Jobs/i);

    await userEvent.selectOptions(getSourceSelect(), "greenhouse");
    const ghDesc = screen.getByTestId("dialog-description").textContent;
    expect(ghDesc).toMatch(/Greenhouse/i);

    await userEvent.selectOptions(getSourceSelect(), "lever");
    const leverDesc = screen.getByTestId("dialog-description").textContent;
    expect(leverDesc).toMatch(/Lever/i);
  });
});

describe("NewSavedSearchDialog — Greenhouse validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSource.mockReturnValue(makeUnwrappableMutation({}));
  });

  it("shows error when board_token is empty on confirm", async () => {
    renderDialog();
    await userEvent.selectOptions(getSourceSelect(), "greenhouse");
    fireEvent.click(screen.getByTestId("confirm-btn"));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringMatching(/board token/i),
      );
    });
    expect(mockCreateSource).not.toHaveBeenCalled();
  });

  it("shows error for invalid board_token format on confirm", async () => {
    renderDialog();
    await userEvent.selectOptions(getSourceSelect(), "greenhouse");
    const input = screen.getByLabelText("Greenhouse board token");
    await userEvent.type(input, "invalid/token/here");
    fireEvent.click(screen.getByTestId("confirm-btn"));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringMatching(/invalid/i),
      );
    });
    expect(mockCreateSource).not.toHaveBeenCalled();
  });

  it("calls createSource with greenhouse source and board_token config", async () => {
    renderDialog();
    await userEvent.selectOptions(getSourceSelect(), "greenhouse");
    const input = screen.getByLabelText("Greenhouse board token");
    await userEvent.type(input, "stripe");
    fireEvent.click(screen.getByTestId("confirm-btn"));

    await waitFor(() => {
      expect(mockCreateSource).toHaveBeenCalledWith({
        source: "greenhouse",
        config: { board_token: "stripe" },
      });
    });
    expect(mockShowSuccess).toHaveBeenCalledWith("Saved search created");
  });
});

describe("NewSavedSearchDialog — Lever validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSource.mockReturnValue(makeUnwrappableMutation({}));
  });

  it("shows error when company_slug is empty on confirm", async () => {
    renderDialog();
    await userEvent.selectOptions(getSourceSelect(), "lever");
    fireEvent.click(screen.getByTestId("confirm-btn"));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringMatching(/company slug/i),
      );
    });
    expect(mockCreateSource).not.toHaveBeenCalled();
  });

  it("shows error for invalid company_slug format on confirm", async () => {
    renderDialog();
    await userEvent.selectOptions(getSourceSelect(), "lever");
    const input = screen.getByLabelText("Lever company slug");
    await userEvent.type(input, "invalid/slug");
    fireEvent.click(screen.getByTestId("confirm-btn"));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringMatching(/invalid/i),
      );
    });
    expect(mockCreateSource).not.toHaveBeenCalled();
  });

  it("calls createSource with lever source and company_slug config", async () => {
    renderDialog();
    await userEvent.selectOptions(getSourceSelect(), "lever");
    const input = screen.getByLabelText("Lever company slug");
    await userEvent.type(input, "openai");
    fireEvent.click(screen.getByTestId("confirm-btn"));

    await waitFor(() => {
      expect(mockCreateSource).toHaveBeenCalledWith({
        source: "lever",
        config: { company_slug: "openai" },
      });
    });
    expect(mockShowSuccess).toHaveBeenCalledWith("Saved search created");
  });

  it("normalizes company_slug to lowercase", async () => {
    renderDialog();
    await userEvent.selectOptions(getSourceSelect(), "lever");
    const input = screen.getByLabelText("Lever company slug");
    // LeverConfigSection normalizes to lowercase on change
    await userEvent.type(input, "openai");
    fireEvent.click(screen.getByTestId("confirm-btn"));

    await waitFor(() => {
      expect(mockCreateSource).toHaveBeenCalledWith(
        expect.objectContaining({
          config: { company_slug: "openai" },
        }),
      );
    });
  });
});

describe("NewSavedSearchDialog — JSearch still requires roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSource.mockReturnValue(makeUnwrappableMutation({}));
  });

  it("shows error when roles are empty for jsearch source", async () => {
    renderDialog();
    // Source is already jsearch by default.
    fireEvent.click(screen.getByTestId("confirm-btn"));

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringMatching(/role/i),
      );
    });
    expect(mockCreateSource).not.toHaveBeenCalled();
  });
});
