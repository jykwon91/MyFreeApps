/**
 * A 409 on Run research (this company's research is already running, from another tab or device):
 * the set message in the toast and the panel rather than "Research failed", and Retry stays.
 * The run is keyed to the company, so a reopened page shares the run in flight.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showError } from "@platform/ui";
import { COMPANY_RESEARCH_ALREADY_RUNNING_MESSAGE } from "@myjobhunter/api-client/constants/companyResearchMessages";
import { companyResearchRunKey } from "@myjobhunter/api-client/utils/companyResearchRunKey";
import CompanyResearchPanel from "../CompanyResearchPanel";

const trigger = vi.fn();
const useTrigger = vi.fn();
let mutationState: { isLoading: boolean; isUninitialized: boolean; isError: boolean; error: unknown; reset: () => void };

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  extractErrorMessage: () => "Research for this company is already running",
}));

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useGetCompanyResearchQuery: () => ({ data: undefined, isError: false, error: undefined }),
  useTriggerCompanyResearchMutation: (options: unknown) => {
    useTrigger(options);
    return [trigger, mutationState];
  },
}));

const running = { status: 409, data: { detail: "Research for this company is already running" } };

describe("CompanyResearchPanel already running", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationState = { isLoading: false, isUninitialized: true, isError: false, error: undefined, reset: vi.fn() };
    trigger.mockReturnValue({ unwrap: () => Promise.reject(running) });
  });

  it("keys the run to the company so a reopened page shares it", () => {
    render(<CompanyResearchPanel companyId="c1" />);
    expect(useTrigger).toHaveBeenCalledWith({ fixedCacheKey: companyResearchRunKey("c1") });
  });

  it("toasts that the research is already running, not that it failed", async () => {
    render(<CompanyResearchPanel companyId="c1" />);
    await userEvent.click(screen.getByRole("button", { name: /run research/i }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(COMPANY_RESEARCH_ALREADY_RUNNING_MESSAGE));
  });

  it("says so in the panel and still offers Retry", async () => {
    mutationState = { isLoading: false, isUninitialized: false, isError: true, error: running, reset: vi.fn() };
    render(<CompanyResearchPanel companyId="c1" />);

    expect(screen.getByText(COMPANY_RESEARCH_ALREADY_RUNNING_MESSAGE)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(trigger).toHaveBeenCalledTimes(1);
  });
});
