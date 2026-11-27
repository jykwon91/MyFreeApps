import type { SavingsCategory } from "@mybookkeeper/api-client/types/savings/savings-category";
import { SAVINGS_MESSAGES as MSG } from "./savings-messages";

/** Where an idea's category has its own page in the app. */
export const SAVINGS_CATEGORY_PAGES: Partial<Record<SavingsCategory, { to: string; label: string }>> = {
  mortgage: { to: "/mortgages", label: MSG.openMortgages },
  utilities: { to: "/utility-plans", label: MSG.openUtilityPlans },
};

/** The ``?category=`` search param. */
export const SAVINGS_CATEGORY_PARAM = "category";

/** Idea rows the skeleton draws. */
export const SAVINGS_SKELETON_ROWS = 4;
