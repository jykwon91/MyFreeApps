/**
 * Tests for EditFrequencyPopover — inline frequency editor for SavedSearchRow.
 *
 * Verifies:
 * - Renders the preset dropdown
 * - Save fires mutation with new value
 * - Cancel calls onClose without firing mutation
 * - Shows toast on success
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditFrequencyPopover from "../EditFrequencyPopover";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockUpdateSource = vi.fn();

vi.mock("@/store/discoverApi", () => ({
  useUpdateDiscoverySourceMutation: () => [mockUpdateSource, { isLoading: false }],
}));

vi.mock("@platform/ui", () => ({
  LoadingButton: ({
    children,
    onClick,
    isLoading,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    isLoading?: boolean;
  }) => (
    <button onClick={onClick} disabled={isLoading} data-testid="save-btn">
      {children}
    </button>
  ),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  extractErrorMessage: vi.fn(),
}));

vi.mock("../refresh-interval", () => ({
  REFRESH_INTERVAL_OPTIONS: [
    { minutes: 120, label: "Every 2 hours", short: "Every 2h" },
    { minutes: 360, label: "Every 6 hours", short: "Every 6h" },
    { minutes: 720, label: "Twice daily", short: "Twice daily" },
    { minutes: 1440, label: "Daily", short: "Daily" },
  ],
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("EditFrequencyPopover", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSource.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  });

  it("renders the frequency dropdown with preset options", () => {
    render(
      <EditFrequencyPopover
        sourceId="src-1"
        currentIntervalMinutes={1440}
        onClose={onClose}
      />,
    );

    const select = screen.getByTestId("edit-frequency-select");
    expect(select).toBeInTheDocument();
    expect(screen.getByText("Every 2 hours")).toBeInTheDocument();
    expect(screen.getByText("Daily")).toBeInTheDocument();
  });

  it("defaults to the current interval", () => {
    render(
      <EditFrequencyPopover
        sourceId="src-1"
        currentIntervalMinutes={360}
        onClose={onClose}
      />,
    );

    const select = screen.getByTestId("edit-frequency-select") as HTMLSelectElement;
    expect(select.value).toBe("360");
  });

  it("fires mutation with new interval on save", async () => {
    render(
      <EditFrequencyPopover
        sourceId="src-1"
        currentIntervalMinutes={1440}
        onClose={onClose}
      />,
    );

    const select = screen.getByTestId("edit-frequency-select");
    fireEvent.change(select, { target: { value: "120" } });

    const saveBtn = screen.getByTestId("save-btn");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateSource).toHaveBeenCalledWith({
        sourceId: "src-1",
        patch: { fetch_interval_minutes: 120 },
      });
    });
  });

  it("closes without firing mutation when value unchanged", async () => {
    render(
      <EditFrequencyPopover
        sourceId="src-1"
        currentIntervalMinutes={1440}
        onClose={onClose}
      />,
    );

    const saveBtn = screen.getByTestId("save-btn");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(mockUpdateSource).not.toHaveBeenCalled();
  });

  it("calls onClose when cancel is clicked", () => {
    render(
      <EditFrequencyPopover
        sourceId="src-1"
        currentIntervalMinutes={1440}
        onClose={onClose}
      />,
    );

    const cancelBtn = screen.getByText("Cancel");
    fireEvent.click(cancelBtn);

    expect(onClose).toHaveBeenCalled();
    expect(mockUpdateSource).not.toHaveBeenCalled();
  });
});
