/** EducationDialog checks a GPA with the same shared rule the phone uses, before anything is sent. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PROFILE_FORM_PROBLEMS } from "@myjobhunter/api-client/constants/profileFormProblems";

vi.mock("@myjobhunter/api-client/store/educationApi", () => ({
  useCreateEducationMutation: vi.fn(),
  useUpdateEducationMutation: vi.fn(),
}));

// Mock @platform/ui completely — avoids importing React 19 code into a React 18 test environment.
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

import EducationDialog from "@/features/profile/EducationDialog";
import {
  useCreateEducationMutation,
  useUpdateEducationMutation,
} from "@myjobhunter/api-client/store/educationApi";

const createTrigger = vi.fn();

function renderDialog() {
  return render(<EducationDialog open={true} onOpenChange={() => {}} />);
}

async function submitWithGpa(gpa: string) {
  fireEvent.change(screen.getByLabelText(/School/), { target: { value: "State University" } });
  fireEvent.change(screen.getByLabelText("GPA"), { target: { value: gpa } });
  await userEvent.click(screen.getByRole("button", { name: "Add education" }));
}

describe("EducationDialog — shared validation", () => {
  beforeEach(() => {
    createTrigger.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({}) });
    vi.mocked(useCreateEducationMutation).mockReturnValue([
      createTrigger,
      { isLoading: false },
    ] as unknown as ReturnType<typeof useCreateEducationMutation>);
    vi.mocked(useUpdateEducationMutation).mockReturnValue([
      vi.fn(),
      { isLoading: false },
    ] as unknown as ReturnType<typeof useUpdateEducationMutation>);
  });

  it("refuses a GPA with three decimals and sends nothing", async () => {
    renderDialog();
    await submitWithGpa("3.855");

    expect(await screen.findByText(PROFILE_FORM_PROBLEMS.gpa)).toBeInTheDocument();
    expect(createTrigger).not.toHaveBeenCalled();
  });

  it("sends a GPA with two decimals", async () => {
    renderDialog();
    await submitWithGpa("3.85");

    await waitFor(() => expect(createTrigger).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(PROFILE_FORM_PROBLEMS.gpa)).not.toBeInTheDocument();
  });
});
