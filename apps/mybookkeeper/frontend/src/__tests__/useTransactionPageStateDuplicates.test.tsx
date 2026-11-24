import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTransactionPageState } from "@/app/features/transactions/hooks/useTransactionPageState";
import { EMPTY_FINANCIAL_ACCOUNTS_QUERY } from "@/test/empty-financial-accounts";

const REASON = "These transactions are linked to different tenants. Set the same one on both, or clear it on one of them, then try again.";

const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
const mockMerge = vi.fn();
const mockKeep = vi.fn();

vi.mock("@/shared/hooks/useToast", () => ({ useToast: () => ({ showError: mockShowError, showSuccess: mockShowSuccess }) }));
vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({ useGetPropertiesQuery: () => ({ data: [] }) }));
vi.mock("@mybookkeeper/api-client/store/financialAccountsApi", () => ({
  useListFinancialAccountsQuery: () => EMPTY_FINANCIAL_ACCOUNTS_QUERY,
}));
vi.mock("@mybookkeeper/api-client/store/transactionsApi", async () => {
  const { queryData } = await import("@/test/rtk-query-data");
  const idle = () => [vi.fn(), { isLoading: false }];
  const pageQuery = {
    ...queryData({ items: [], total: 0, has_more: false }),
    error: undefined,
    refetch: vi.fn(),
    isLoading: false,
    isFetching: false,
  };
  return {
    useGetTransactionPageQuery: () => pageQuery,
    useListTransactionCategoriesQuery: () => ({ data: [] }),
    useLazyListTransactionSelectionQuery: () => [vi.fn(), { data: undefined }],
    useGetDuplicatesQuery: () => ({ data: undefined, isLoading: false }),
    useBulkApproveTransactionsMutation: idle,
    useBulkDeleteTransactionsMutation: idle,
    useBulkSetCapitalImprovementMutation: idle,
    useUpdateTransactionMutation: idle,
    useDeleteTransactionMutation: idle,
    useKeepDuplicateMutation: () => [(body: unknown) => ({ unwrap: () => mockKeep(body) })],
    useDismissDuplicateMutation: idle,
    useMergeDuplicatesMutation: () => [(body: unknown) => ({ unwrap: () => mockMerge(body) })],
  };
});

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

beforeEach(() => vi.clearAllMocks());

describe("useTransactionPageState duplicate failures", () => {
  it("shows the server's reason when a merge is refused for different tenants", async () => {
    mockMerge.mockRejectedValueOnce({ status: 409, data: { detail: REASON } });
    const { result } = renderHook(() => useTransactionPageState(), { wrapper });

    await act(async () => result.current.handleMergeDuplicate("a", "b", "b", {}));

    expect(mockShowError).toHaveBeenCalledWith(REASON);
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it("shows the server's reason when keeping one is refused", async () => {
    mockKeep.mockRejectedValueOnce({ status: 409, data: { detail: REASON } });
    const { result } = renderHook(() => useTransactionPageState(), { wrapper });

    await act(async () => result.current.handleKeepDuplicate("a", ["b"]));

    expect(mockShowError).toHaveBeenCalledWith(REASON);
  });

  it("keeps the general message for any other merge failure", async () => {
    mockMerge.mockRejectedValueOnce({ status: 500, data: { detail: "boom" } });
    const { result } = renderHook(() => useTransactionPageState(), { wrapper });

    await act(async () => result.current.handleMergeDuplicate("a", "b", "b", {}));

    expect(mockShowError).toHaveBeenCalledWith("Failed to merge transactions");
  });
});
