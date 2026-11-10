import { MAX_BULK_TRANSACTION_IDS } from "@mybookkeeper/api-client/constants/transactionBulk";
import { act, renderHook } from "@testing-library/react-native";
import { useBulkApprove } from "../src/features/transactions/useBulkApprove";

const mockShowToast = jest.fn();
const mockSend = jest.fn();

jest.mock("@platform/mobile", () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock("@mybookkeeper/api-client/store/transactionsApi", () => ({
  useBulkApproveTransactionsMutation: () => [(batch: string[]) => ({ unwrap: () => mockSend(batch) })],
}));

const ids = Array.from({ length: MAX_BULK_TRANSACTION_IDS + 1 }, (_, i) => `t${i}`);

beforeEach(() => jest.clearAllMocks());

describe("useBulkApprove", () => {
  it("sends batches within the server cap and sums them", async () => {
    mockSend.mockResolvedValueOnce({ approved: 499, skipped: 1 }).mockResolvedValueOnce({ approved: 1, skipped: 0 });
    const { result } = await renderHook(() => useBulkApprove());

    let done = false;
    await act(async () => {
      done = await result.current.approve(ids);
    });

    expect(mockSend.mock.calls.map(([batch]) => batch.length)).toEqual([MAX_BULK_TRANSACTION_IDS, 1]);
    expect(done).toBe(true);
    expect(mockShowToast).toHaveBeenCalledWith("500 approved, 1 skipped");
  });

  it("says what the first batch did when a later one fails, and keeps the selection", async () => {
    mockSend.mockResolvedValueOnce({ approved: 497, skipped: 3 }).mockRejectedValueOnce(new Error("boom"));
    const { result } = await renderHook(() => useBulkApprove());

    let done = true;
    await act(async () => {
      done = await result.current.approve(ids);
    });

    expect(done).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith("Approved 497, skipped 3. The rest failed — try again.", "error");
  });
});
