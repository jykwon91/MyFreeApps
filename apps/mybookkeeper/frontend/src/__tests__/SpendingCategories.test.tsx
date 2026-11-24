import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError, showSuccess } from "@platform/ui";
import SpendingCategoriesBody from "@/app/features/spending-categories/SpendingCategoriesBody";
import type { SpendingCategoryListResponse } from "@mybookkeeper/api-client/types/spending-category/SpendingCategoryListResponse";

const archiveMutation = vi.fn();
const unarchiveMutation = vi.fn();
const updateMutation = vi.fn();
const createMutation = vi.fn();

vi.mock("@mybookkeeper/api-client/store/spendingCategoriesApi", () => ({
  useCreateSpendingCategoryMutation: () => [createMutation, { isLoading: false }],
  useUpdateSpendingCategoryMutation: () => [updateMutation, { isLoading: false }],
  useArchiveSpendingCategoryMutation: () => [archiveMutation, { isLoading: false }],
  useUnarchiveSpendingCategoryMutation: () => [unarchiveMutation, { isLoading: false }],
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

beforeEach(() => {
  archiveMutation.mockReset();
  unarchiveMutation.mockReset();
  updateMutation.mockReset();
  createMutation.mockReset();
  vi.mocked(showError).mockReset();
  vi.mocked(showSuccess).mockReset();
});
afterEach(cleanup);

function makeData(overrides?: Partial<SpendingCategoryListResponse>): SpendingCategoryListResponse {
  return {
    items: [
      { id: "cat-1", organization_id: "org-1", name: "Groceries", is_default: true, archived_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      { id: "cat-2", organization_id: "org-1", name: "Custom Category", is_default: false, archived_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      { id: "cat-3", organization_id: "org-1", name: "Old Category", is_default: false, archived_at: "2026-01-05T00:00:00Z", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-05T00:00:00Z" },
    ],
    ...overrides,
  };
}

describe("SpendingCategoriesBody", () => {
  it("shows skeleton while loading", () => {
    render(<SpendingCategoriesBody data={undefined} isLoading={true} isError={false} isFetching={false} onRetry={vi.fn()} />);
    expect(screen.getByTestId("spending-categories-skeleton")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<SpendingCategoriesBody data={undefined} isLoading={false} isError={true} isFetching={false} onRetry={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("lists live and archived categories", () => {
    render(<SpendingCategoriesBody data={makeData()} isLoading={false} isError={false} isFetching={false} onRetry={vi.fn()} />);
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    expect(screen.getByText("Custom Category")).toBeInTheDocument();
    expect(screen.getByText("Old Category")).toBeInTheDocument();
  });

  it("does not show archive button for default categories", () => {
    render(<SpendingCategoriesBody data={makeData()} isLoading={false} isError={false} isFetching={false} onRetry={vi.fn()} />);
    // Groceries (cat-1) is default — should have no archive button
    expect(screen.queryByTestId("archive-btn-cat-1")).not.toBeInTheDocument();
  });

  it("shows restore button for archived categories", () => {
    render(<SpendingCategoriesBody data={makeData()} isLoading={false} isError={false} isFetching={false} onRetry={vi.fn()} />);
    expect(screen.getByTestId("restore-btn-cat-3")).toBeInTheDocument();
  });

  it("archives a custom category when archive is clicked", async () => {
    archiveMutation.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    render(<SpendingCategoriesBody data={makeData()} isLoading={false} isError={false} isFetching={false} onRetry={vi.fn()} />);
    await userEvent.click(screen.getByTestId("archive-btn-cat-2"));
    expect(archiveMutation).toHaveBeenCalledWith("cat-2");
  });

  it("restores an archived category when restore is clicked", async () => {
    unarchiveMutation.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    render(<SpendingCategoriesBody data={makeData()} isLoading={false} isError={false} isFetching={false} onRetry={vi.fn()} />);
    await userEvent.click(screen.getByTestId("restore-btn-cat-3"));
    expect(unarchiveMutation).toHaveBeenCalledWith("cat-3");
  });
});
