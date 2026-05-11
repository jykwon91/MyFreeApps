/**
 * Tests for EditSavedSearchDialog.
 *
 * Covers:
 * - Opens with pre-filled fields (name, frequency, per-source config)
 * - Source-kind input is disabled (read-only) in edit mode
 * - No mutation fired when nothing changed (closes cleanly)
 * - Mutation sent with diff payload: name change only
 * - Mutation sent with diff payload: config change only (Greenhouse board_token)
 * - Mutation sent with diff payload: config change only (Lever company_slug)
 * - Mutation sent with diff payload: frequency change only
 * - Greenhouse validation: empty board_token shows error
 * - Lever validation: empty company_slug shows error
 * - JSearch validation: no roles shows error
 * - Config patch includes source_kind for backend per-source validation
 * - Closes on cancel without firing mutation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditSavedSearchDialog from "../EditSavedSearchDialog";
import type { DiscoverySource } from "@/types/discovery/discovery-source";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUpdateSource = vi.fn();
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();

vi.mock("@/store/discoverApi", () => ({
  useUpdateDiscoverySourceMutation: () => [mockUpdateSource, { isLoading: false }],
}));

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
  extractErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

// Stub the dialog-section sub-components so we can test the dialog in
// isolation without pulling in their dependencies.
vi.mock("../dialog-sections/GreenhouseConfigSection", () => ({
  default: ({
    boardToken,
    onBoardTokenChange,
  }: {
    boardToken: string;
    onBoardTokenChange: (v: string) => void;
    excludedKeywords: string[];
    onExcludedKeywordsChange: (v: string[]) => void;
  }) => (
    <div>
      <input
        data-testid="board-token-input"
        value={boardToken}
        onChange={(e) => onBoardTokenChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock("../dialog-sections/LeverConfigSection", () => ({
  default: ({
    companySlug,
    onCompanySlugChange,
  }: {
    companySlug: string;
    onCompanySlugChange: (v: string) => void;
    excludedKeywords: string[];
    onExcludedKeywordsChange: (v: string[]) => void;
  }) => (
    <div>
      <input
        data-testid="company-slug-input"
        value={companySlug}
        onChange={(e) => onCompanySlugChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock("../dialog-sections/SearchInputsSection", () => ({
  default: ({
    roles,
    onRolesChange,
  }: {
    roles: string[];
    onRolesChange: (v: string[]) => void;
    roleSuggestions: string[];
    skills: string[];
    onSkillsChange: (v: string[]) => void;
    skillSuggestions: string[];
    location: string;
    onLocationChange: (v: string) => void;
    locationDisabled: boolean;
  }) => (
    <div>
      <input
        data-testid="roles-input"
        value={roles.join(",")}
        onChange={(e) => onRolesChange(e.target.value ? e.target.value.split(",") : [])}
      />
    </div>
  ),
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

vi.mock("../refresh-interval", () => ({
  REFRESH_INTERVAL_OPTIONS: [
    { minutes: 120, label: "Every 2 hours", short: "Every 2h" },
    { minutes: 360, label: "Every 6 hours", short: "Every 6h" },
    { minutes: 1440, label: "Daily", short: "Daily" },
  ],
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGreenhouseSource(
  overrides: Partial<DiscoverySource> = {},
): DiscoverySource {
  return {
    id: "src-gh-1",
    source: "greenhouse",
    name: "Stripe engineering",
    config: { board_token: "stripe", excluded_keywords: [] },
    is_active: true,
    fetch_interval_minutes: 1440,
    last_fetched_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error_message: null,
    consecutive_failures: 0,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

function makeLeverSource(
  overrides: Partial<DiscoverySource> = {},
): DiscoverySource {
  return {
    id: "src-lv-1",
    source: "lever",
    name: "OpenAI roles",
    config: { company_slug: "openai", excluded_keywords: [] },
    is_active: true,
    fetch_interval_minutes: 1440,
    last_fetched_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error_message: null,
    consecutive_failures: 0,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

function makeJSearchSource(
  overrides: Partial<DiscoverySource> = {},
): DiscoverySource {
  return {
    id: "src-js-1",
    source: "jsearch",
    name: "Backend roles",
    config: {
      roles: ["software engineer"],
      skills: [],
      country: "us",
      date_posted: "week",
      remote_jobs_only: false,
      employment_type: "FULLTIME",
      experience: "",
    },
    is_active: true,
    fetch_interval_minutes: 1440,
    last_fetched_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error_message: null,
    consecutive_failures: 0,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EditSavedSearchDialog", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSource.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  });

  // ---------------------------------------------------------------------------
  // Pre-fill
  // ---------------------------------------------------------------------------

  describe("pre-fill from existing source", () => {
    it("pre-fills the name field from the existing source", () => {
      render(
        <EditSavedSearchDialog
          source={makeGreenhouseSource({ name: "Stripe backend" })}
          open={true}
          onClose={onClose}
        />,
      );

      const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
      expect(nameInput.value).toBe("Stripe backend");
    });

    it("pre-fills the refresh frequency from the existing source", () => {
      render(
        <EditSavedSearchDialog
          source={makeGreenhouseSource({ fetch_interval_minutes: 360 })}
          open={true}
          onClose={onClose}
        />,
      );

      const freqSelect = screen.getByLabelText(
        /refresh frequency/i,
      ) as HTMLSelectElement;
      expect(freqSelect.value).toBe("360");
    });

    it("pre-fills Greenhouse board_token from existing config", () => {
      render(
        <EditSavedSearchDialog
          source={makeGreenhouseSource({
            config: { board_token: "anthropic", excluded_keywords: [] },
          })}
          open={true}
          onClose={onClose}
        />,
      );

      const tokenInput = screen.getByTestId(
        "board-token-input",
      ) as HTMLInputElement;
      expect(tokenInput.value).toBe("anthropic");
    });

    it("pre-fills Lever company_slug from existing config", () => {
      render(
        <EditSavedSearchDialog
          source={makeLeverSource({
            config: { company_slug: "stripe", excluded_keywords: [] },
          })}
          open={true}
          onClose={onClose}
        />,
      );

      const slugInput = screen.getByTestId(
        "company-slug-input",
      ) as HTMLInputElement;
      expect(slugInput.value).toBe("stripe");
    });
  });

  // ---------------------------------------------------------------------------
  // Source-kind locked
  // ---------------------------------------------------------------------------

  describe("source kind is read-only", () => {
    it("renders a disabled source-kind input for greenhouse", () => {
      render(
        <EditSavedSearchDialog
          source={makeGreenhouseSource()}
          open={true}
          onClose={onClose}
        />,
      );

      const sourceInput = screen.getByLabelText(
        /job source \(read-only\)/i,
      ) as HTMLInputElement;
      expect(sourceInput.disabled).toBe(true);
      expect(sourceInput.value).toBe("Greenhouse");
    });

    it("renders a disabled source-kind input for lever", () => {
      render(
        <EditSavedSearchDialog
          source={makeLeverSource()}
          open={true}
          onClose={onClose}
        />,
      );

      const sourceInput = screen.getByLabelText(
        /job source \(read-only\)/i,
      ) as HTMLInputElement;
      expect(sourceInput.disabled).toBe(true);
      expect(sourceInput.value).toBe("Lever");
    });

    it("renders a disabled source-kind input for jsearch", () => {
      render(
        <EditSavedSearchDialog
          source={makeJSearchSource()}
          open={true}
          onClose={onClose}
        />,
      );

      const sourceInput = screen.getByLabelText(
        /job source \(read-only\)/i,
      ) as HTMLInputElement;
      expect(sourceInput.disabled).toBe(true);
      expect(sourceInput.value).toBe("Jsearch");
    });
  });

  // ---------------------------------------------------------------------------
  // No-op save
  // ---------------------------------------------------------------------------

  describe("no mutation when nothing changed", () => {
    it("closes without firing mutation when no fields are changed", async () => {
      render(
        <EditSavedSearchDialog
          source={makeGreenhouseSource()}
          open={true}
          onClose={onClose}
        />,
      );

      fireEvent.click(screen.getByTestId("confirm-btn"));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
      expect(mockUpdateSource).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Diff-only patches
  // ---------------------------------------------------------------------------

  describe("sends only changed fields in the PATCH body", () => {
    it("sends only name when name changes", async () => {
      render(
        <EditSavedSearchDialog
          source={makeGreenhouseSource({ name: "Stripe engineering" })}
          open={true}
          onClose={onClose}
        />,
      );

      const nameInput = screen.getByLabelText(/name/i);
      fireEvent.change(nameInput, { target: { value: "Stripe backend team" } });

      fireEvent.click(screen.getByTestId("confirm-btn"));

      await waitFor(() => {
        expect(mockUpdateSource).toHaveBeenCalledWith({
          sourceId: "src-gh-1",
          patch: { name: "Stripe backend team" },
        });
      });
    });

    it("sends only fetch_interval_minutes when frequency changes", async () => {
      render(
        <EditSavedSearchDialog
          source={makeGreenhouseSource({ fetch_interval_minutes: 1440 })}
          open={true}
          onClose={onClose}
        />,
      );

      const freqSelect = screen.getByLabelText(/refresh frequency/i);
      fireEvent.change(freqSelect, { target: { value: "360" } });

      fireEvent.click(screen.getByTestId("confirm-btn"));

      await waitFor(() => {
        expect(mockUpdateSource).toHaveBeenCalledWith({
          sourceId: "src-gh-1",
          patch: { fetch_interval_minutes: 360 },
        });
      });
    });

    it("sends config + source_kind when Greenhouse board_token changes", async () => {
      render(
        <EditSavedSearchDialog
          source={makeGreenhouseSource({
            config: { board_token: "stripe", excluded_keywords: [] },
          })}
          open={true}
          onClose={onClose}
        />,
      );

      const tokenInput = screen.getByTestId("board-token-input");
      fireEvent.change(tokenInput, { target: { value: "anthropic" } });

      fireEvent.click(screen.getByTestId("confirm-btn"));

      await waitFor(() => {
        expect(mockUpdateSource).toHaveBeenCalledWith({
          sourceId: "src-gh-1",
          patch: {
            // excluded_keywords is always included in the replacement config so
            // the diff comparison is symmetric with the original JSONB shape.
            config: { board_token: "anthropic", excluded_keywords: [] },
            source_kind: "greenhouse",
          },
        });
      });
    });

    it("sends config + source_kind when Lever company_slug changes", async () => {
      render(
        <EditSavedSearchDialog
          source={makeLeverSource({
            config: { company_slug: "openai", excluded_keywords: [] },
          })}
          open={true}
          onClose={onClose}
        />,
      );

      const slugInput = screen.getByTestId("company-slug-input");
      fireEvent.change(slugInput, { target: { value: "anthropic" } });

      fireEvent.click(screen.getByTestId("confirm-btn"));

      await waitFor(() => {
        expect(mockUpdateSource).toHaveBeenCalledWith({
          sourceId: "src-lv-1",
          patch: {
            // excluded_keywords is always included in the replacement config.
            config: { company_slug: "anthropic", excluded_keywords: [] },
            source_kind: "lever",
          },
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe("client-side validation", () => {
    it("shows error when Greenhouse board_token is cleared", async () => {
      render(
        <EditSavedSearchDialog
          source={makeGreenhouseSource({
            config: { board_token: "stripe", excluded_keywords: [] },
          })}
          open={true}
          onClose={onClose}
        />,
      );

      const tokenInput = screen.getByTestId("board-token-input");
      fireEvent.change(tokenInput, { target: { value: "" } });

      fireEvent.click(screen.getByTestId("confirm-btn"));

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith("Enter a Greenhouse board token");
      });
      expect(mockUpdateSource).not.toHaveBeenCalled();
    });

    it("shows error when Lever company_slug is cleared", async () => {
      render(
        <EditSavedSearchDialog
          source={makeLeverSource({
            config: { company_slug: "openai", excluded_keywords: [] },
          })}
          open={true}
          onClose={onClose}
        />,
      );

      const slugInput = screen.getByTestId("company-slug-input");
      fireEvent.change(slugInput, { target: { value: "" } });

      fireEvent.click(screen.getByTestId("confirm-btn"));

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith("Enter a Lever company slug");
      });
      expect(mockUpdateSource).not.toHaveBeenCalled();
    });

    it("shows error when JSearch roles are cleared", async () => {
      render(
        <EditSavedSearchDialog
          source={makeJSearchSource({
            config: {
              roles: ["software engineer"],
              skills: [],
              country: "us",
              date_posted: "week",
              remote_jobs_only: false,
              employment_type: "FULLTIME",
              experience: "",
            },
          })}
          open={true}
          onClose={onClose}
        />,
      );

      const rolesInput = screen.getByTestId("roles-input");
      fireEvent.change(rolesInput, { target: { value: "" } });

      fireEvent.click(screen.getByTestId("confirm-btn"));

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith("Add at least one role title");
      });
      expect(mockUpdateSource).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------

  describe("cancel", () => {
    it("calls onClose without firing mutation when cancel is clicked", () => {
      render(
        <EditSavedSearchDialog
          source={makeGreenhouseSource()}
          open={true}
          onClose={onClose}
        />,
      );

      fireEvent.click(screen.getByTestId("cancel-btn"));

      expect(onClose).toHaveBeenCalled();
      expect(mockUpdateSource).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Not rendered when closed
  // ---------------------------------------------------------------------------

  describe("closed state", () => {
    it("does not render when open is false", () => {
      render(
        <EditSavedSearchDialog
          source={makeGreenhouseSource()}
          open={false}
          onClose={onClose}
        />,
      );

      expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    });
  });
});
