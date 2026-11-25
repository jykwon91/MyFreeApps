import type { TransactionStatus } from "../transaction/TransactionStatus";

export interface PersonalTransferUnmarkResult {
  transaction_id: string;
  /** The status it had before it was marked. */
  status: TransactionStatus;
  /** Its Payment Review card was reopened. */
  back_in_review: boolean;
  forgotten_senders: number;
}
