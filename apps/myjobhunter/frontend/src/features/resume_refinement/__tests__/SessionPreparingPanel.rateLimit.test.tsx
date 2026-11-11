/** A 429 on Try again: the refinement message in the toast, and Try again works again. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError } from "@platform/ui";
import { RATE_LIMITED_MESSAGES } from "@myjobhunter/api-client/constants/rateLimitedMessages";
import SessionPreparingPanel from "../SessionPreparingPanel";
import { makeRefinementSession } from "./makeRefinementSession";

const retryPreparation = vi.fn();

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  extractErrorMessage: () => "Too many attempts",
}));

vi.mock("@myjobhunter/api-client/store/resumeRefinementApi", () => ({
  useRetryPreparationMutation: () => [retryPreparation, { isLoading: false }],
}));

describe("SessionPreparingPanel rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    retryPreparation.mockReturnValue({ unwrap: () => Promise.reject({ status: 429, data: { detail: "Too many attempts" } }) });
  });

  it("toasts the refinement message and Try again can be pressed again", async () => {
    render(<SessionPreparingPanel session={makeRefinementSession({ status: "failed" })} />);
    const retry = screen.getByRole("button", { name: "Try again" });
    await userEvent.click(retry);

    await waitFor(() => expect(showError).toHaveBeenCalledWith(RATE_LIMITED_MESSAGES.resumeRefinement));
    await userEvent.click(retry);
    expect(retryPreparation).toHaveBeenCalledTimes(2);
  });
});
