/** What a Send now came to, in the words an app shows the operator. */
export interface RentReminderSendOutcome {
  message: string;
  /** A channel failed or may not have gone out, so the app shows this as a problem. */
  isProblem: boolean;
}
