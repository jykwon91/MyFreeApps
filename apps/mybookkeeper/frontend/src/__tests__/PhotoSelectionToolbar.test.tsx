import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PhotoSelectionToolbar from "@/app/features/listings/PhotoSelectionToolbar";

function renderToolbar(overrides: Partial<Parameters<typeof PhotoSelectionToolbar>[0]> = {}) {
  const defaults = {
    selectedCount: 2,
    totalCount: 5,
    onSelectAll: vi.fn(),
    onClear: vi.fn(),
    onBulkDelete: vi.fn(),
    onBulkDownload: vi.fn(),
    isBulkDeleting: false,
    isBulkDownloading: false,
  };
  return { ...defaults, ...render(<PhotoSelectionToolbar {...defaults} {...overrides} />) };
}

describe("PhotoSelectionToolbar", () => {
  it("renders the selection count", () => {
    renderToolbar({ selectedCount: 3 });
    expect(screen.getByTestId("photo-selection-count")).toHaveTextContent("3 selected");
  });

  it("shows Select all when not all are selected", () => {
    renderToolbar({ selectedCount: 2, totalCount: 5 });
    expect(screen.getByTestId("photo-select-all-button")).toBeInTheDocument();
  });

  it("hides Select all when all are selected", () => {
    renderToolbar({ selectedCount: 5, totalCount: 5 });
    expect(screen.queryByTestId("photo-select-all-button")).not.toBeInTheDocument();
  });

  it("calls onSelectAll when Select all is clicked", async () => {
    const onSelectAll = vi.fn();
    renderToolbar({ onSelectAll });
    await userEvent.click(screen.getByTestId("photo-select-all-button"));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it("calls onClear when Clear is clicked", async () => {
    const onClear = vi.fn();
    renderToolbar({ onClear });
    await userEvent.click(screen.getByTestId("photo-clear-selection-button"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("calls onBulkDelete when Delete is clicked", async () => {
    const onBulkDelete = vi.fn();
    renderToolbar({ onBulkDelete });
    await userEvent.click(screen.getByTestId("photo-bulk-delete-button"));
    expect(onBulkDelete).toHaveBeenCalledTimes(1);
  });

  it("calls onBulkDownload when Download is clicked", async () => {
    const onBulkDownload = vi.fn();
    renderToolbar({ onBulkDownload });
    await userEvent.click(screen.getByTestId("photo-bulk-download-button"));
    expect(onBulkDownload).toHaveBeenCalledTimes(1);
  });

  it("disables both action buttons while bulk deleting", () => {
    renderToolbar({ isBulkDeleting: true });
    expect(screen.getByTestId("photo-bulk-delete-button")).toBeDisabled();
    expect(screen.getByTestId("photo-bulk-download-button")).toBeDisabled();
  });

  it("disables both action buttons while bulk downloading", () => {
    renderToolbar({ isBulkDownloading: true });
    expect(screen.getByTestId("photo-bulk-delete-button")).toBeDisabled();
    expect(screen.getByTestId("photo-bulk-download-button")).toBeDisabled();
  });

  it("shows 'Deleting...' label while bulk deleting", () => {
    renderToolbar({ isBulkDeleting: true });
    expect(screen.getByTestId("photo-bulk-delete-button")).toHaveTextContent("Deleting...");
  });

  it("shows 'Downloading...' label while bulk downloading", () => {
    renderToolbar({ isBulkDownloading: true });
    expect(screen.getByTestId("photo-bulk-download-button")).toHaveTextContent("Downloading...");
  });
});
