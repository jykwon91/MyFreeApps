export interface PersonalTransferUnmarkRequest {
  transaction_id: string;
  /** Also stop treating this sender's future payments as personal transfers. */
  forget_sender: boolean;
}
