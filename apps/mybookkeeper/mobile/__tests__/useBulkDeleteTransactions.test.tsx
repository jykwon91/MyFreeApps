import { MAX_BULK_TRANSACTION_IDS } from "@mybookkeeper/api-client/constants/transactionBulk";
import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useBulkDeleteTransactions } from "../src/features/transactions/useBulkDeleteTransactions";
import { pressAlertButton } from "../test-support/pressAlertButton";

const mockShowToast = jest.fn();
const mockSend = jest.fn();

jest.mock("@platform/mobile", () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock("@mybookkeeper/api-client/store/transactionsApi", () => ({
  useBulkDeleteTransactionsMutation: () => [(batch: string[]) => ({ unwrap: () => mockSend(batch) })],
}));

const ids = Array.from({ length: MAX_BULK_TRANSACTION_IDS * 2 + 3 }, (_, i) => `t${i}`);
let alert: jest.SpiedFunction<typeof Alert.alert>;

beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, "alert");
});
afterEach(() => alert.mockRestore());

describe("useBulkDeleteTransactions", () => {
  it("sends batches within the server cap and sums them", async () => {
    mockSend.mockResolvedValue({ deleted: 1, skipped: 0 });
    mockSend.mockResolvedValueOnce({ deleted: 499, skipped: 1 }).mockResolvedValueOnce({ deleted: 500, skipped: 0 }).mockResolvedValueOnce({ deleted: 3, skipped: 0 });
    const onSettled = jest.fn();
    const { result } = await renderHook(() => useBulkDeleteTransactions(onSettled));

    await act(async () => result.current.askToDelete(ids));
    expect(alert.mock.calls[0]?.[0]).toBe("Delete 1003 transactions?");
    await pressAlertButton(alert, "Delete");

    expect(mockSend.mock.calls.map(([batch]) => batch.length)).toEqual([MAX_BULK_TRANSACTION_IDS, MAX_BULK_TRANSACTION_IDS, 3]);
    expect(mockShowToast).toHaveBeenCalledWith("1002 transaction(s) deleted, 1 skipped", "success");
    expect(onSettled).toHaveBeenCalledWith(ids, []);
  });

  it("reports the batches that went through and hands back the ones that didn't", async () => {
    mockSend.mockResolvedValueOnce({ deleted: 497, skipped: 3 }).mockRejectedValueOnce(new Error("boom"));
    const onSettled = jest.fn();
    const { result } = await renderHook(() => useBulkDeleteTransactions(onSettled));

    await act(async () => result.current.askToDelete(ids));
    await pressAlertButton(alert, "Delete");

    expect(mockShowToast).toHaveBeenCalledWith("Deleted 497, skipped 3. The rest failed — try again.", "error");
    expect(onSettled).toHaveBeenCalledWith(ids, ids.slice(MAX_BULK_TRANSACTION_IDS));
  });

  it("doesn't ask about nothing", async () => {
    const { result } = await renderHook(() => useBulkDeleteTransactions(jest.fn()));
    await act(async () => result.current.askToDelete([]));
    expect(alert).not.toHaveBeenCalled();
  });
});
