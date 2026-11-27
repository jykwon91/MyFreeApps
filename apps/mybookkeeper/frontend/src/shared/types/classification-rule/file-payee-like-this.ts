import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { ApplyRuleToPast } from "./apply-rule-to-past";

/** What useFilePayeeLikeThis gives the transaction panel. */
export interface FilePayeeLikeThis {
  /** Save the payee rule from the saved row, then ask about past payments; resolves once that's answered. */
  fileLikeThis: (saved: Transaction) => Promise<void>;
  /** Saving the rule or counting past payments. */
  isBusy: boolean;
  applyToPast: ApplyRuleToPast;
}
