import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClassificationRulesPanel from "@/app/features/transactions/ClassificationRulesPanel";
import { showError, showSuccess } from "@platform/ui";
import { useIsOrgAdmin } from "@/shared/hooks/useOrgRole";
import { CLASSIFICATION_RULE_MESSAGES } from "@/shared/lib/classification-rule-messages";
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
  source: "user_correction",
  priority: 0,
  times_applied: 3,
  is_active: true,
  created_at: "2026-10-01T00:00:00Z",
};

const refetch = vi.fn();
const deleteRule = vi.fn();

type ListState = { data: ClassificationRule[] | undefined; isLoading: boolean; isError: boolean; isFetching: boolean };
let listState: ListState;

vi.mock("@mybookkeeper/api-client/store/classificationRulesApi", () => ({
  useListClassificationRulesQuery: vi.fn(() => ({ ...listState, refetch })),
  useDeleteClassificationRuleMutation: vi.fn(() => [deleteRule]),
}));
vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [] })),
}));
vi.mock("@/shared/hooks/useOrgRole", () => ({ useIsOrgAdmin: vi.fn(() => true) }));
vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

function rejectWith(status: number) {
  deleteRule.mockReturnValue({ unwrap: () => Promise.reject({ status }) });
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
