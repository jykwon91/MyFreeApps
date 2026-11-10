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

    let failed: string[] = ["x"];
    await act(async () => {
      failed = await result.current.approve(ids);
    });

    expect(mockSend.mock.calls.map(([batch]) => batch.length)).toEqual([MAX_BULK_TRANSACTION_IDS, 1]);
    expect(failed).toEqual([]);
    expect(mockShowToast).toHaveBeenCalledWith("500 approved, 1 skipped", "success");
  });

  it("says what the first batch did when a later one fails, and hands back the ids that were not sent", async () => {
    mockSend.mockResolvedValueOnce({ approved: 497, skipped: 3 }).mockRejectedValueOnce(new Error("boom"));
    const { result } = await renderHook(() => useBulkApprove());

    let failed: string[] = [];
    await act(async () => {
      failed = await result.current.approve(ids);
    });

    expect(failed).toEqual(ids.slice(MAX_BULK_TRANSACTION_IDS));
    expect(mockShowToast).toHaveBeenCalledWith("Approved 497, skipped 3. The rest failed — try again.", "error");
  });
});
