import { CHANNELS } from "@mybookkeeper/api-client/constants/transactionChannels";
import { PAYMENT_METHODS } from "@mybookkeeper/api-client/constants/transactionPaymentMethods";
import { formatTag } from "@platform/core/utils/tag";
import type { TransactionChoice } from "../types/TransactionChoice";
import { NO_PROPERTY_OPTION } from "./transactionEdit";

const NONE: TransactionChoice = { value: NO_PROPERTY_OPTION, label: "None" };

function withNone(values: readonly string[]): TransactionChoice[] {
  return [NONE, ...values.map((value) => ({ value, label: formatTag(value) }))];
}

export const CHANNEL_OPTIONS = withNone(CHANNELS);
export const PAYMENT_METHOD_CHOICES = withNone(PAYMENT_METHODS);
