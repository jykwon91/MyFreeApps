import type { PersonalTransferMarkResult } from "../types/personal-transfer/personal-transfer-mark-result";
import type { PersonalTransferSender } from "../types/personal-transfer/personal-transfer-sender";
import type { PersonalTransferUnmarkResult } from "../types/personal-transfer/personal-transfer-unmark-result";

/** "Dao Nguyen" or "Dao Nguyen (dao@example.com)". */
export function personalSenderLabel(sender: PersonalTransferSender): string {
  return sender.payer_handle ? `${sender.display_name} (${sender.payer_handle})` : sender.display_name;
}

/** The toast after marking a payment a personal transfer. Shared by the website and the phone. */
export function personalTransferMarkedMessage(result: PersonalTransferMarkResult): string {
  if (result.remembered_sender === null) {
    return "Marked as a personal transfer. It won't count towards your totals.";
  }
  const name = result.remembered_sender.display_name;
  const cleared = result.also_cleared;
  const more = cleared > 0 ? ` I also cleared ${cleared} more ${cleared === 1 ? "payment" : "payments"} from them.` : "";
  return `Marked as a personal transfer. I'll skip ${name}'s payments from now on.${more}`;
}

/** The toast after un-marking one. */
export function personalTransferUnmarkedMessage(result: PersonalTransferUnmarkResult): string {
  const review = result.back_in_review ? " It's back in Payment Review." : "";
  const forgot = result.forgotten_senders > 0 ? " I'll stop skipping that sender too." : "";
  return `Got it, that's not a personal transfer.${review}${forgot}`;
}

/** The toast after forgetting a remembered sender. */
export function personalSenderForgottenMessage(sender: PersonalTransferSender): string {
  return `I'll stop skipping ${sender.display_name}. Their next payment will show up in Payment Review.`;
}
