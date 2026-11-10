import { MAX_BULK_TRANSACTION_IDS } from "@mybookkeeper/api-client/constants/transactionBulk";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTransactionPageState } from "@/app/features/transactions/hooks/useTransactionPageState";

const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
const mockBulkDelete = vi.fn();
const mockBulkApprove = vi.fn();

vi.mock("@/shared/hooks/useToast", () => ({ useToast: () => ({ showError: mockShowError, showSuccess: mockShowSuccess }) }));
vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({ useGetPropertiesQuery: () => ({ data: [] }) }));
vi.mock("@mybookkeeper/api-client/store/transactionsApi", () => {
  const idle = () => [vi.fn(), { isLoading: false }];
  return {
    useListTransactionsQuery: () => ({ data: [], isLoading: false }),
    useGetDuplicatesQuery: () => ({ data: undefined, isLoading: false }),
    useBulkApproveTransactionsMutation: () => [(batch: string[]) => ({ unwrap: () => mockBulkApprove(batch) })],
    useBulkDeleteTransactionsMutation: () => [(batch: string[]) => ({ unwrap: () => mockBulkDelete(batch) })],
    useUpdateTransactionMutation: idle,
    useDeleteTransactionMutation: idle,
    useKeepDuplicateMutation: idle,
    useDismissDuplicateMutation: idle,
    useMergeDuplicatesMutation: idle,
  };
});

const ids = Array.from({ length: MAX_BULK_TRANSACTION_IDS + 1 }, (_, i) => `t${i}`);
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

beforeEach(() => vi.clearAllMocks());

describe("useTransactionPageState bulk actions over the cap", () => {
  it("deletes in batches within the cap and totals them", async () => {
    mockBulkDelete.mockResolvedValueOnce({ deleted: 500, skipped: 0 }).mockResolvedValueOnce({ deleted: 1, skipped: 0 });
    const { result } = renderHook(() => useTransactionPageState(), { wrapper });

    await act(async () => result.current.executeBulkDelete(ids));

    expect(mockBulkDelete.mock.calls.map(([batch]) => batch.length)).toEqual([MAX_BULK_TRANSACTION_IDS, 1]);
    expect(mockShowSuccess).toHaveBeenCalledWith("501 transaction(s) deleted");
  });

  it("reports what a delete did before a later batch failed", async () => {
    mockBulkDelete.mockResolvedValueOnce({ deleted: 500, skipped: 0 }).mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useTransactionPageState(), { wrapper });

    await act(async () => result.current.executeBulkDelete(ids));

    expect(mockShowError).toHaveBeenCalledWith("Deleted 500. The rest failed — try again.");
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it("reports what an approve did before a later batch failed", async () => {
    mockBulkApprove.mockResolvedValueOnce({ approved: 497, skipped: 3 }).mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useTransactionPageState(), { wrapper });

    await act(async () => result.current.handleBulkApprove(ids));

    expect(mockShowError).toHaveBeenCalledWith("Approved 497, skipped 3. The rest failed — try again.");
  });
});
