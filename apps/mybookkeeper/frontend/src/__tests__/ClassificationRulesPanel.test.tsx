import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClassificationRulesPanel from "@/app/features/transactions/ClassificationRulesPanel";
import { showError, showSuccess } from "@platform/ui";
import { useIsOrgAdmin } from "@/shared/hooks/useOrgRole";
import { CLASSIFICATION_RULE_MESSAGES } from "@/shared/lib/classification-rule-messages";
import { PAYEE_RULE_MESSAGES } from "@/shared/lib/payee-rule-messages";
import { WRITE_RATE_LIMITED_MESSAGE } from "@mybookkeeper/api-client/constants/writeFailureMessages";
import type { ClassificationRule } from "@mybookkeeper/api-client/types/classification-rule/classification-rule";

const rule: ClassificationRule = {
  id: "rule-1",
  organization_id: "org-1",
  match_type: "document_type",
  match_pattern: "Home Depot",
  match_context: null,
  category: "repairs",
  property_id: null,
  activity_id: null,
  transaction_scope: null,
  split_property_ids: [],
  source: "user_correction",
  priority: 0,
  times_applied: 3,
  is_active: true,
  created_at: "2026-10-01T00:00:00Z",
};

const refetch = vi.fn();
const deleteRule = vi.fn();
const countPastMatches = vi.fn();
const applyRuleToPast = vi.fn();
let properties: { id: string; name: string }[] = [];

type ListState = { data: ClassificationRule[] | undefined; isLoading: boolean; isError: boolean; isFetching: boolean };
let listState: ListState;

vi.mock("@mybookkeeper/api-client/store/classificationRulesApi", () => ({
  useListClassificationRulesQuery: vi.fn(() => ({ ...listState, refetch })),
  useDeleteClassificationRuleMutation: vi.fn(() => [deleteRule]),
  useLazyGetRulePastMatchesQuery: vi.fn(() => [countPastMatches]),
  useApplyRuleToPastMutation: vi.fn(() => [applyRuleToPast, { isLoading: false }]),
}));
vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: properties })),
}));
vi.mock("@/shared/hooks/useOrgRole", () => ({ useIsOrgAdmin: vi.fn(() => true) }));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

function rejectWith(status: number, detail?: string) {
  deleteRule.mockReturnValue({ unwrap: () => Promise.reject({ status, data: detail ? { detail } : undefined }) });
}

async function openConfirm() {
  await userEvent.click(screen.getByRole("button", { name: "Delete rule for Home Depot" }));
  return screen.getByText("Delete classification rule");
}

beforeEach(() => {
  vi.clearAllMocks();
  listState = { data: [rule], isLoading: false, isError: false, isFetching: false };
  vi.mocked(useIsOrgAdmin).mockReturnValue(true);
  deleteRule.mockReturnValue({ unwrap: () => Promise.resolve() });
  properties = [];
});

describe("ClassificationRulesPanel delete flow", () => {
  it("hides the delete button for members who cannot delete", () => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(false);
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    expect(screen.getByText("Home Depot")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete rule/i })).not.toBeInTheDocument();
  });

  it("shows the delete button at least 44px square for admins", () => {
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Delete rule for Home Depot" });
    expect(button).toHaveClass("h-11", "w-11");
  });

  it("labels the match type with the shared label", () => {
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    expect(screen.getByText("Document type")).toBeInTheDocument();
    expect(screen.queryByText("document_type")).not.toBeInTheDocument();
  });

  it("keeps the dialog open with a loading button until the request finishes", async () => {
    let finish: () => void = () => undefined;
    deleteRule.mockReturnValue({ unwrap: () => new Promise<void>((resolve) => { finish = resolve; }) });
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    await openConfirm();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText("Delete classification rule")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /processing/i })).toBeDisabled();

    finish();
    await waitFor(() => expect(screen.queryByText("Delete classification rule")).not.toBeInTheDocument());
    expect(showSuccess).toHaveBeenCalledWith(CLASSIFICATION_RULE_MESSAGES.deleted);
  });

  it("toasts and closes the dialog on 404, then reopens cleanly", async () => {
    rejectWith(404);
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    await openConfirm();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(CLASSIFICATION_RULE_MESSAGES.alreadyDeleted));
    await waitFor(() => expect(screen.queryByText("Delete classification rule")).not.toBeInTheDocument());

    await openConfirm();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("says a demo workspace can't be changed, not view-only, on the demo 403", async () => {
    rejectWith(403, "This feature is not available for demo accounts");
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    await openConfirm();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(CLASSIFICATION_RULE_MESSAGES.deleteDemo));
    expect(screen.queryByText("Delete classification rule")).not.toBeInTheDocument();
  });

  it("shows the view-only message on 403 and closes the dialog", async () => {
    rejectWith(403);
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    await openConfirm();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(CLASSIFICATION_RULE_MESSAGES.deleteViewOnly));
    expect(screen.queryByText("Delete classification rule")).not.toBeInTheDocument();
  });

  it.each([500, 400])("shows the try-again message on %i and keeps the dialog open", async (status) => {
    rejectWith(status);
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    await openConfirm();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(CLASSIFICATION_RULE_MESSAGES.deleteFailed));
    expect(screen.getByText("Delete classification rule")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  it("says to wait, not to retry now, when the server limits the delete (429)", async () => {
    rejectWith(429);
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    await openConfirm();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(WRITE_RATE_LIMITED_MESSAGE));
    expect(screen.getByText("Delete classification rule")).toBeInTheDocument();
  });

  it("sends one request when confirm is pressed twice while pending", async () => {
    let finish: () => void = () => undefined;
    deleteRule.mockReturnValue({ unwrap: () => new Promise<void>((resolve) => { finish = resolve; }) });
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    await openConfirm();
    const confirm = screen.getByRole("button", { name: "Delete" });
    await userEvent.click(confirm);
    await userEvent.click(confirm);
    await userEvent.dblClick(confirm);

    expect(deleteRule).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.queryByText("Delete classification rule")).not.toBeInTheDocument());
  });

  it("ignores Escape while the delete is in flight", async () => {
    let finish: () => void = () => undefined;
    deleteRule.mockReturnValue({ unwrap: () => new Promise<void>((resolve) => { finish = resolve; }) });
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    await openConfirm();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.getByText("Delete classification rule")).toBeInTheDocument();
    finish();
    await waitFor(() => expect(screen.queryByText("Delete classification rule")).not.toBeInTheDocument());
  });

  it("closes the dialog on Escape when nothing is in flight", async () => {
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    await openConfirm();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Delete classification rule")).not.toBeInTheDocument());
    expect(deleteRule).not.toHaveBeenCalled();
  });
});

describe("ClassificationRulesPanel list states", () => {
  it("shows a retry alert, not the empty state, when the load failed", async () => {
    listState = { data: undefined, isLoading: false, isError: true, isFetching: false };
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    expect(screen.getByText(CLASSIFICATION_RULE_MESSAGES.couldntLoad)).toBeInTheDocument();
    expect(screen.queryByText("No classification rules yet.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [true, 4],
    [false, 3],
  ])("loading skeleton for canDelete=%s has %i columns", (canDelete, columns) => {
    vi.mocked(useIsOrgAdmin).mockReturnValue(canDelete);
    listState = { data: undefined, isLoading: true, isError: false, isFetching: true };
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    const skeleton = screen.getByTestId("classification-rules-skeleton");
    expect(skeleton.querySelectorAll("thead th")).toHaveLength(columns);
    expect(skeleton.querySelectorAll("tbody tr:first-child td")).toHaveLength(columns);
  });
});

describe("ClassificationRulesPanel payee rules", () => {
  const HOUSES = [
    { id: "p-6732", name: "6732 Peerless" },
    { id: "p-6734", name: "6734 Peerless" },
    { id: "p-6738", name: "6738 Peerless" },
  ];
  const payeeRule: ClassificationRule = {
    ...rule,
    id: "rule-2",
    match_type: "vendor",
    match_pattern: "zelle payment to jason law",
    category: "maintenance",
    transaction_scope: "rental",
    split_property_ids: HOUSES.map((h) => h.id),
  };
  const applyLabel = PAYEE_RULE_MESSAGES.applyToPastLabel(payeeRule.match_pattern);

  beforeEach(() => {
    properties = HOUSES;
    listState = { data: [payeeRule, rule], isLoading: false, isError: false, isFetching: false };
  });

  it("shows a payee rule's scope and the properties it splits across", () => {
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    expect(screen.getByText("| Rental")).toBeInTheDocument();
    expect(screen.getByText("| Split evenly: 6732 Peerless, 6734 Peerless, 6738 Peerless")).toBeInTheDocument();
  });

  it("offers Apply to past on payee rules only", () => {
    render(<ClassificationRulesPanel onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: applyLabel })).toHaveClass("h-11", "w-11");
    expect(screen.queryByRole("button", { name: PAYEE_RULE_MESSAGES.applyToPastLabel("Home Depot") })).not.toBeInTheDocument();
  });

  it("confirms the count, then files the past payments", async () => {
    countPastMatches.mockReturnValue({ unwrap: () => Promise.resolve({ count: 15 }) });
    applyRuleToPast.mockReturnValue({ unwrap: () => Promise.resolve({ applied: 15 }) });
    render(<ClassificationRulesPanel onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: applyLabel }));
    expect(await screen.findByText(PAYEE_RULE_MESSAGES.pastDescription(15, payeeRule.match_pattern))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: PAYEE_RULE_MESSAGES.pastConfirm(15) }));

    expect(applyRuleToPast).toHaveBeenCalledWith("rule-2");
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(PAYEE_RULE_MESSAGES.applied(15, payeeRule.match_pattern)));
    await waitFor(() => expect(screen.queryByText(PAYEE_RULE_MESSAGES.pastTitle)).not.toBeInTheDocument());
  });

  it("says when there's nothing in the past to file, without asking", async () => {
    countPastMatches.mockReturnValue({ unwrap: () => Promise.resolve({ count: 0 }) });
    render(<ClassificationRulesPanel onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: applyLabel }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(PAYEE_RULE_MESSAGES.nothingToApply(payeeRule.match_pattern)));
    expect(screen.queryByText(PAYEE_RULE_MESSAGES.pastTitle)).not.toBeInTheDocument();
    expect(applyRuleToPast).not.toHaveBeenCalled();
  });

  it("keeps the question open and says so when filing fails", async () => {
    countPastMatches.mockReturnValue({ unwrap: () => Promise.resolve({ count: 2 }) });
    applyRuleToPast.mockReturnValue({ unwrap: () => Promise.reject({ status: 500 }) });
    render(<ClassificationRulesPanel onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: applyLabel }));
    await userEvent.click(await screen.findByRole("button", { name: PAYEE_RULE_MESSAGES.pastConfirm(2) }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(PAYEE_RULE_MESSAGES.couldntApply));
    expect(screen.getByText(PAYEE_RULE_MESSAGES.pastTitle)).toBeInTheDocument();
  });
});
