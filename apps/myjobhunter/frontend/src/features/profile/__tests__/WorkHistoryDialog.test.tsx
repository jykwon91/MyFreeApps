/**
 * Unit tests for WorkHistoryDialog — the is_current checkbox logic.
 *
 * Covers:
 *   - checking "I currently work in this role" disables and clears the end date
 *   - submit sends is_current: true with a null end_date
 *   - edit mode pre-checks the checkbox for a current entry
 *   - submit for a past role sends is_current: false with the typed end_date
 *
 * Testing pattern mirrors Profile.test.tsx for the RTK Query and
 * @platform/ui mock wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkHistory } from "@/types/work-history/work-history";

vi.mock("@/lib/workHistoryApi", () => ({
  useCreateWorkHistoryMutation: vi.fn(),
  useUpdateWorkHistoryMutation: vi.fn(),
}));

// Mock @platform/ui completely — avoids importing React 19 code from
// packages/shared-frontend into a React 18 test environment (two-copies crash).
vi.mock("@platform/ui", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  extractErrorMessage: (err: unknown) => String(err),
  LoadingButton: ({
    children,
    isLoading,
    loadingText,
    type,
  }: {
    children: React.ReactNode;
    isLoading?: boolean;
    loadingText?: string;
    type?: "button" | "submit" | "reset";
  }) => <button type={type}>{isLoading ? loadingText : children}</button>,
}));

import WorkHistoryDialog from "@/features/profile/WorkHistoryDialog";
import {
  useCreateWorkHistoryMutation,
  useUpdateWorkHistoryMutation,
} from "@/lib/workHistoryApi";

const mockUseCreate = vi.mocked(useCreateWorkHistoryMutation);
const mockUseUpdate = vi.mocked(useUpdateWorkHistoryMutation);

const createTrigger = vi.fn();
const updateTrigger = vi.fn();

function setupMutationMocks() {
  createTrigger.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({}) });
  updateTrigger.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({}) });
  mockUseCreate.mockReturnValue([
    createTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useCreateWorkHistoryMutation>);
  mockUseUpdate.mockReturnValue([
    updateTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useUpdateWorkHistoryMutation>);
}

function renderDialog(existing?: WorkHistory) {
  return render(
    <WorkHistoryDialog open={true} onOpenChange={() => {}} existing={existing} />,
  );
}

const existingCurrentEntry: WorkHistory = {
  id: "wh1",
  user_id: "u1",
  profile_id: "p1",
  company_name: "CurrentCo",
  title: "Engineer",
  start_date: "2022-11-01",
  end_date: null,
  is_current: true,
  bullets: ["Did things"],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("WorkHistoryDialog — is_current", () => {
  beforeEach(() => {
    setupMutationMocks();
  });

  it("checking the current-role box disables and clears the end date", async () => {
    renderDialog();
    const endDate = screen.getByLabelText("End date") as HTMLInputElement;
    fireEvent.change(endDate, { target: { value: "2024-05-01" } });
    expect(endDate.value).toBe("2024-05-01");

    await userEvent.click(screen.getByLabelText("I currently work in this role"));

    expect(endDate).toBeDisabled();
    expect(endDate.value).toBe("");
  });

  it("submit sends is_current true with a null end_date", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "SWE" } });
    fireEvent.change(screen.getByLabelText(/Start date/), {
      target: { value: "2023-03-01" },
    });
    await userEvent.click(screen.getByLabelText("I currently work in this role"));

    await userEvent.click(screen.getByRole("button", { name: "Add work history" }));

    await waitFor(() => expect(createTrigger).toHaveBeenCalledTimes(1));
    expect(createTrigger).toHaveBeenCalledWith({
      company_name: "Acme",
      title: "SWE",
      start_date: "2023-03-01",
      end_date: null,
      is_current: true,
      bullets: [],
    });
  });

  it("edit mode pre-checks the box for a current entry", () => {
    renderDialog(existingCurrentEntry);
    const checkbox = screen.getByLabelText(
      "I currently work in this role",
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByLabelText("End date")).toBeDisabled();
  });

  it("submit for a past role sends is_current false with the end date", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Company/), { target: { value: "OldCo" } });
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Dev" } });
    fireEvent.change(screen.getByLabelText(/Start date/), {
      target: { value: "2019-01-01" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2021-06-30" },
    });

    await userEvent.click(screen.getByRole("button", { name: "Add work history" }));

    await waitFor(() => expect(createTrigger).toHaveBeenCalledTimes(1));
    expect(createTrigger).toHaveBeenCalledWith({
      company_name: "OldCo",
      title: "Dev",
      start_date: "2019-01-01",
      end_date: "2021-06-30",
      is_current: false,
      bullets: [],
    });
  });
});
