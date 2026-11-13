import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { scheduleELineLabel } from "@mybookkeeper/api-client/utils/scheduleELineLabel";
import { CHANNEL_OPTIONS, PAYMENT_METHOD_CHOICES } from "../../constants/transactionCreateOptions";
import { TAX_REPORT_FACT, TRANSACTION_FIELD_LABELS as LABELS } from "../../constants/transactionFieldLabels";
import { choiceLabel } from "./transactionCreateValues";
import TransactionFact from "./TransactionFact";
import TransactionSavedVendorFact from "./TransactionSavedVendorFact";

/** What the website's edit form shows beyond the basics: tax year, saved vendor, channel, payment method and tax treatment. */
export default function TransactionTaxFacts({ transaction }: { transaction: Transaction }) {
  return (
    <>
      <TransactionFact label={LABELS.taxYear} value={String(transaction.tax_year)} />
      {transaction.vendor_id ? <TransactionSavedVendorFact vendorId={transaction.vendor_id} /> : null}
      {transaction.channel ? <TransactionFact label={LABELS.channel} value={choiceLabel(CHANNEL_OPTIONS, transaction.channel)} /> : null}
      {transaction.payment_method ? (
        <TransactionFact label={LABELS.paymentMethod} value={choiceLabel(PAYMENT_METHOD_CHOICES, transaction.payment_method)} />
      ) : null}
      <TransactionFact label={LABELS.taxReports} value={transaction.tax_relevant ? TAX_REPORT_FACT.included : TAX_REPORT_FACT.excluded} />
      {transaction.schedule_e_line ? <TransactionFact label={LABELS.scheduleE} value={scheduleELineLabel(transaction.schedule_e_line)} /> : null}
    </>
  );
}
