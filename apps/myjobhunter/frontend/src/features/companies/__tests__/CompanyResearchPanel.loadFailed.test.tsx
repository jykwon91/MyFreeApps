/**
 * A failed read of the research must retry by reading again, never by starting a paid run.
 * Also: a skeleton during the first load, no Retry for a deleted company, a toast when a run finishes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { showSuccess } from "@platform/ui";
import { COMPANY_RESEARCH_READY_MESSAGE } from "@myjobhunter/api-client/constants/companyResearchMessages";
import CompanyResearchPanel from "../CompanyResearchPanel";

const trigger = vi.fn();
const refetch = vi.fn();
let query: Record<string, unknown>;
let mutationState: { isLoading: boolean; isUninitialized: boolean; isError: boolean; error: unknown; reset: () => void };

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("@myjobhunter/api-client/store/companiesApi", () => ({
  useGetCompanyResearchQuery: () => query,
  useTriggerCompanyResearchMutation: () => [trigger, mutationState],
}));

describe("CompanyResearchPanel failed load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query = { data: undefined, isError: false, error: undefined, isFetching: false, refetch };
    mutationState = { isLoading: false, isUninitialized: true, isError: false, error: undefined, reset: vi.fn() };
    trigger.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  });

  it("retries a failed load by refetching and does not start a run", async () => {
    query = { ...query, isError: true, error: { status: 500 } };
    render(<CompanyResearchPanel companyId="c1" />);

    expect(screen.getByText("Couldn't load the research.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(trigger).not.toHaveBeenCalled();
  });

  it("shows a skeleton, not Run research, during the first load", () => {
    query = { ...query, isFetching: true };
    render(<CompanyResearchPanel companyId="c1" />);

    expect(screen.getByLabelText(/loading research/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run research/i })).not.toBeInTheDocument();
  });

  it("offers no Retry for a company that's gone", () => {
    mutationState = { ...mutationState, isError: true, error: { status: 404, data: { detail: "Company not found" } } };
    render(<CompanyResearchPanel companyId="c1" />);

    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("toasts when a run finishes", async () => {
    render(<CompanyResearchPanel companyId="c1" />);
    await userEvent.click(screen.getByRole("button", { name: /run research/i }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(COMPANY_RESEARCH_READY_MESSAGE));
  });
});
