import { formatDate } from "@/shared/utils/date";
import { CASH_BASIS_MESSAGES as MSG } from "@/shared/lib/cash-basis-messages";

export interface CashBasisNoteProps {
  /** "YYYY-MM-DD", or null when no bank feed has brought anything in. */
  bankHistoryStart: string | null;
}

/** The one line that says which rows a cash view counts. */
export default function CashBasisNote({ bankHistoryStart }: CashBasisNoteProps) {
  return (
    <p className="text-sm text-muted-foreground" data-testid="cash-basis-note">
      {bankHistoryStart ? MSG.fromBankHistory(formatDate(bankHistoryStart)) : MSG.noBankHistory}
    </p>
  );
}
