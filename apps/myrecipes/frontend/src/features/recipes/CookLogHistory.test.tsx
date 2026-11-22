/**
 * Deleting a logged cook: a 404 means it's already gone, so the dialog closes and it says so
 * (the refreshed log drops the row); any other failure says the delete failed and keeps the dialog
 * open so it can be retried.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOK_LOG_MESSAGES } from "@myrecipes/api-client/constants/cookLog";
import type { CookLogResponse } from "@myrecipes/api-client/types/recipe/cook-log";
import CookLogHistory from "./CookLogHistory";

const { deleteCook, showSuccess, showError } = vi.hoisted(() => ({
  deleteCook: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showSuccess,
  showError,
}));

vi.mock("@myrecipes/api-client/store/recipesApi", () => ({
  useDeleteCookMutation: () => [deleteCook, { isLoading: false }],
}));

const COOK: CookLogResponse = {
  id: "c1",
  version_id: "v1",
  cooked_at: "2026-11-10T00:00:00Z",
  rating: 4,
  outcome_notes: "Needed more salt",
  created_at: "2026-11-10T00:00:00Z",
};

async function confirmDelete() {
  render(<CookLogHistory recipeId="r1" cooks={[COOK]} versionNumberById={{ v1: 1 }} />);
  await userEvent.click(screen.getByRole("button", { name: COOK_LOG_MESSAGES.deleteLabel }));
  await userEvent.click(screen.getByRole("button", { name: /^Delete$/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CookLogHistory delete", () => {
  it("treats a 404 as already deleted: says so and closes the dialog", async () => {
    deleteCook.mockReturnValue({ unwrap: () => Promise.reject({ status: 404, data: { detail: "Not found" } }) });
    await confirmDelete();

    expect(deleteCook).toHaveBeenCalledWith({ recipeId: "r1", cookId: "c1" });
    expect(showSuccess).toHaveBeenCalledWith(COOK_LOG_MESSAGES.gone);
    expect(showError).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says it failed and keeps the dialog on any other failure", async () => {
    deleteCook.mockReturnValue({ unwrap: () => Promise.reject({ status: 500, data: { detail: "boom" } }) });
    await confirmDelete();

    expect(showError).toHaveBeenCalledWith(COOK_LOG_MESSAGES.couldntDelete);
    expect(showSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
