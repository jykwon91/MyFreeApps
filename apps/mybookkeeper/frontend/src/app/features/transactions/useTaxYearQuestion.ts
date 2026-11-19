import { useCallback, useRef, useState } from "react";
import { TAX_YEAR_CHOICE } from "@mybookkeeper/api-client/constants/taxYearChange";
import type { TaxYearChoice } from "@mybookkeeper/api-client/types/transaction/TaxYearChoice";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { otherTaxYear } from "@mybookkeeper/api-client/utils/transactionTaxYear";
import type { TaxYearQuestion } from "@/shared/types/transaction/tax-year-question";

/**
 * A date moved into another year doesn't move the tax year by itself, so before saving the
 * person says which year the row files under: it decides which year's tax report shows it.
 * A tax year typed in is already the answer, so only a new date alone asks.
 *
 * `decide` resolves to what to add to the save, or null when the person backs out to keep editing.
 */
export function useTaxYearQuestion(original: Pick<Transaction, "tax_year">) {
  const [question, setQuestion] = useState<TaxYearQuestion | null>(null);
  const resolver = useRef<((choice: TaxYearChoice) => void) | null>(null);

  const answer = useCallback((choice: TaxYearChoice) => {
    resolver.current?.(choice);
    resolver.current = null;
    setQuestion(null);
  }, []);

  async function decide(newDate: string | null, taxYearEdited: boolean): Promise<Partial<Pick<Transaction, "tax_year">> | null> {
    const newYear = newDate && !taxYearEdited ? otherTaxYear(newDate, original) : null;
    if (newYear === null) return {};
    const choice = await new Promise<TaxYearChoice>((resolve) => {
      resolver.current = resolve;
      setQuestion({ currentYear: original.tax_year, newYear });
    });
    if (choice === TAX_YEAR_CHOICE.cancel) return null;
    return choice === TAX_YEAR_CHOICE.move ? { tax_year: newYear } : {};
  }

  return { question, answer, decide };
}
