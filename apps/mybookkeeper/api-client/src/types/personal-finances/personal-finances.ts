import type { PersonalFinancesAverage } from "./personal-finances-average";
import type { PersonalFinancesCategory } from "./personal-finances-category";
import type { PersonalFinancesIncomeSplit } from "./personal-finances-income-split";
import type { PersonalFinancesMonth } from "./personal-finances-month";
import type { PersonalFinancesOneOff } from "./personal-finances-one-off";
import type { PersonalFinancesTotals } from "./personal-finances-totals";

/** Money in and out through your accounts over a range of months. */
export interface PersonalFinances {
  currency: string;
  /** The first day a bank feed covers; null when no bank is connected, and then there is nothing to show. */
  bank_history_start: string | null;
  /** The range shown, "YYYY-MM"; null with no bank history. */
  start: string | null;
  end: string | null;
  /** Every year the bank history touches, newest first. */
  years: number[];
  months: PersonalFinancesMonth[];
  totals: PersonalFinancesTotals;
  income_split: PersonalFinancesIncomeSplit;
  /** Largest first. */
  by_category: PersonalFinancesCategory[];
  one_offs: PersonalFinancesOneOff[];
  average: PersonalFinancesAverage;
}
