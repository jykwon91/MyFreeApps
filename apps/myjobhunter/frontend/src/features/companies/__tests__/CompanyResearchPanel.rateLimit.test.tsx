/** A 429 on Run research: the specific message in the toast and the panel, and Retry still works. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError } from "@platform/ui";
import { RATE_LIMITED_MESSAGES } from "@myjobhunter/api-client/constants/rateLimitedMessages";
import CompanyResearchPanel from "../CompanyResearchPanel";

const trigger = vi.fn();
let mutationState: { isLoading: boolean; isError: boolean; error: unknown };

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  extractErrorMessage: () => "Too many attempts",
}));

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useGetCompanyResearchQuery: () => ({ data: undefined, isError: false, error: undefined }),
  useTriggerCompanyResearchMutation: () => [trigger, mutationState],
}));

const limited = { status: 429, data: { detail: "Too many attempts" } };

describe("CompanyResearchPanel rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationState = { isLoading: false, isError: false, error: undefined };
    trigger.mockReturnValue({ unwrap: () => Promise.reject(limited) });
  });

  it("toasts the research message, not the server's generic line, and leaves the button usable", async () => {
    render(<CompanyResearchPanel companyId="c1" />);
    await userEvent.click(screen.getByRole("button", { name: /run research/i }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(RATE_LIMITED_MESSAGES.companyResearch));

    await userEvent.click(screen.getByRole("button", { name: /run research/i }));
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it("shows the research message in the failed panel and Retry runs the research again", async () => {
    mutationState = { isLoading: false, isError: true, error: limited };
    render(<CompanyResearchPanel companyId="c1" />);

    expect(screen.getByText(RATE_LIMITED_MESSAGES.companyResearch)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(trigger).toHaveBeenCalledTimes(1);
  });
});
