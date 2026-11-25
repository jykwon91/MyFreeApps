import type { PersonalTransferSender } from "./personal-transfer-sender";

export interface PersonalTransferMarkResult {
  transaction_id: string;
  /** Who is skipped from now on; null when the payment named no sender. */
  remembered_sender: PersonalTransferSender | null;
  /** That sender's other open Payment Review cards, marked as well. */
  also_cleared: number;
}
