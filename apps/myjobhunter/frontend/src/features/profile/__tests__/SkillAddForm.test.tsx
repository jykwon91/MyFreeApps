/**
 * SkillAddForm catches a repeated or blank skill with the shared rule, inline, before anything is sent,
 * and shows a name the server says is taken (a 409) the same way.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PROFILE_FORM_PROBLEMS } from "@myjobhunter/api-client/constants/profileFormProblems";

vi.mock("@myjobhunter/api-client/store/skillsApi", () => ({
  useCreateSkillMutation: vi.fn(),
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
    onClick,
    type,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    isLoading?: boolean;
    loadingText?: string;
    onClick?: () => void;
    type?: "button" | "submit" | "reset";
    "aria-label"?: string;
  }) => (
    <button type={type} onClick={onClick} aria-label={ariaLabel}>
      {isLoading ? loadingText : children}
    </button>
  ),
}));

import SkillAddForm from "@/features/profile/SkillAddForm";
import { showError } from "@platform/ui";
import { useCreateSkillMutation } from "@myjobhunter/api-client/store/skillsApi";

const createTrigger = vi.fn();

describe("SkillAddForm — shared validation", () => {
  beforeEach(() => {
    vi.mocked(showError).mockClear();
    createTrigger.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({}) });
    vi.mocked(useCreateSkillMutation).mockReturnValue([
      createTrigger,
      { isLoading: false },
    ] as unknown as ReturnType<typeof useCreateSkillMutation>);
  });

  it("shows the duplicate problem under the name and sends nothing", async () => {
    render(<SkillAddForm existingNames={["TypeScript"]} />);
    fireEvent.change(screen.getByLabelText("Skill name"), { target: { value: " typescript " } });
    await userEvent.click(screen.getByRole("button", { name: "Add skill" }));

    expect(screen.getByRole("alert")).toHaveTextContent(PROFILE_FORM_PROBLEMS.skillDuplicate);
    expect(screen.getByLabelText("Skill name")).toHaveAttribute("aria-invalid", "true");
    expect(createTrigger).not.toHaveBeenCalled();
  });

  it("asks for a name when it is blank", async () => {
    render(<SkillAddForm existingNames={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Add skill" }));

    expect(screen.getByRole("alert")).toHaveTextContent(PROFILE_FORM_PROBLEMS.skillRequired);
    expect(createTrigger).not.toHaveBeenCalled();
  });

  it("sends a new skill and clears the field", async () => {
    render(<SkillAddForm existingNames={["TypeScript"]} />);
    fireEvent.change(screen.getByLabelText("Skill name"), { target: { value: "Go" } });
    await userEvent.click(screen.getByRole("button", { name: "Add skill" }));

    await waitFor(() => expect(createTrigger).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText("Skill name")).toHaveValue(""));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the server's 409 as the duplicate problem under the name, not a toast", async () => {
    createTrigger.mockReturnValue({ unwrap: () => Promise.reject({ status: 409, data: { detail: "Skill already exists" } }) });
    render(<SkillAddForm existingNames={[]} />);
    fireEvent.change(screen.getByLabelText("Skill name"), { target: { value: "Rust" } });
    await userEvent.click(screen.getByRole("button", { name: "Add skill" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(PROFILE_FORM_PROBLEMS.skillDuplicate);
    expect(screen.getByLabelText("Skill name")).toHaveValue("Rust");
    expect(showError).not.toHaveBeenCalled();

    // The same name isn't sent a second time.
    await userEvent.click(screen.getByRole("button", { name: "Add skill" }));
    expect(createTrigger).toHaveBeenCalledTimes(1);
  });

  it("toasts any other failure", async () => {
    createTrigger.mockReturnValue({ unwrap: () => Promise.reject({ status: 500, data: { detail: "boom" } }) });
    render(<SkillAddForm existingNames={[]} />);
    fireEvent.change(screen.getByLabelText("Skill name"), { target: { value: "Rust" } });
    await userEvent.click(screen.getByRole("button", { name: "Add skill" }));

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
