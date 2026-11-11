/**
 * ScreeningAnswerDialog checks the answer's length and the chosen question with the shared rules
 * before anything is sent, and says by the question when the server answers 409 (already answered).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SCREENING_ANSWER_MAX_LENGTH } from "@myjobhunter/api-client/constants/profileFieldLimits";
import { PROFILE_FORM_PROBLEMS } from "@myjobhunter/api-client/constants/profileFormProblems";
import { screeningAnswerProblem } from "@myjobhunter/api-client/utils/screeningAnswerProblem";

vi.mock("@myjobhunter/api-client/store/screeningAnswersApi", () => ({
  useCreateScreeningAnswerMutation: vi.fn(),
  useUpdateScreeningAnswerMutation: vi.fn(),
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

import ScreeningAnswerDialog from "@/features/profile/ScreeningAnswerDialog";
import { showError } from "@platform/ui";
import {
  useCreateScreeningAnswerMutation,
  useUpdateScreeningAnswerMutation,
} from "@myjobhunter/api-client/store/screeningAnswersApi";

const createTrigger = vi.fn();
const TOO_LONG = screeningAnswerProblem("a".repeat(SCREENING_ANSWER_MAX_LENGTH + 1));

function renderDialog() {
  return render(<ScreeningAnswerDialog open={true} onOpenChange={() => {}} existingKeys={[]} />);
}

async function submit(questionKey: string, answer: string) {
  if (questionKey) fireEvent.change(screen.getByLabelText(/Question/), { target: { value: questionKey } });
  fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: answer } });
  await userEvent.click(screen.getByRole("button", { name: "Add answer" }));
}

describe("ScreeningAnswerDialog — shared validation and 409", () => {
  beforeEach(() => {
    vi.mocked(showError).mockClear();
    createTrigger.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({}) });
    vi.mocked(useCreateScreeningAnswerMutation).mockReturnValue([
      createTrigger,
      { isLoading: false },
    ] as unknown as ReturnType<typeof useCreateScreeningAnswerMutation>);
    vi.mocked(useUpdateScreeningAnswerMutation).mockReturnValue([
      vi.fn(),
      { isLoading: false },
    ] as unknown as ReturnType<typeof useUpdateScreeningAnswerMutation>);
  });

  it("refuses an answer over the limit and sends nothing", async () => {
    renderDialog();
    await submit("work_auth_us", "a".repeat(SCREENING_ANSWER_MAX_LENGTH + 1));

    expect(TOO_LONG).toBeDefined();
    expect(await screen.findByText(TOO_LONG ?? "")).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toHaveAttribute("aria-invalid", "true");
    expect(createTrigger).not.toHaveBeenCalled();
  });

  it("sends an answer at the limit", async () => {
    renderDialog();
    await submit("work_auth_us", "a".repeat(SCREENING_ANSWER_MAX_LENGTH));

    await waitFor(() => expect(createTrigger).toHaveBeenCalledTimes(1));
    expect(createTrigger).toHaveBeenCalledWith({ question_key: "work_auth_us", answer: "a".repeat(SCREENING_ANSWER_MAX_LENGTH) });
  });

  it("asks for a question when none is chosen", async () => {
    renderDialog();
    await submit("", "Yes");

    expect(await screen.findByText(PROFILE_FORM_PROBLEMS.questionRequired)).toBeInTheDocument();
    expect(createTrigger).not.toHaveBeenCalled();
  });

  it("says the question already has an answer when the server answers 409, not a toast", async () => {
    createTrigger.mockReturnValue({ unwrap: () => Promise.reject({ status: 409, data: { detail: "Already answered" } }) });
    renderDialog();
    await submit("work_auth_us", "Yes");

    expect(await screen.findByText(PROFILE_FORM_PROBLEMS.screeningAlreadyAnswered)).toBeInTheDocument();
    expect(showError).not.toHaveBeenCalled();
  });
});
