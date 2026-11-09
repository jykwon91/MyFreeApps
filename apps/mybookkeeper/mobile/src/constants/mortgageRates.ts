import type { PropertyType } from "@mybookkeeper/api-client/types/property/PropertyType";

export const RATE_SKELETON_CARDS = ["a", "b"];

export const RENTAL_TYPE_CHOICES: readonly { value: PropertyType; label: string }[] = [
  { value: "short_term", label: "Short-Term Rental" },
  { value: "long_term", label: "Long-Term Rental" },
];

export const MORTGAGE_RATE_MESSAGES = {
  title: "Check for better rates",
  intro: "Freddie Mac's weekly national averages, measured against the loans you hold.",
  idle: "Freddie Mac publishes the average rate lenders quoted nationally each week. I compare every loan you've recorded against it, adjust for whether the property is a rental or where you live, price the replacement over the payments you have left, and then subtract what refinancing costs, because a rate gap that takes eight years to earn back isn't one. If a loan is worth a phone call, I'll say so and say why.",
  check: "Check rates",
  checkAgain: "Check again",
  checking: "Checking rates...",
  loadingLabel: "Checking your loans against this week's rates",
  error: "I couldn't reach the weekly rate data. Nothing is wrong with your loans. Try again shortly.",
  empty: "You don't have any mortgages yet. Add one and I'll have something to compare against the market.",
  addMortgage: "Add a mortgage",
  yourRate: "Your rate",
  comparable: "A comparable loan today",
  paymentsLeft: "Payments left",
  paymentNow: "Payment now",
  paymentRefinanced: "Payment refinanced",
  youdSave: "You'd save",
  closingCosts: "Closing costs",
  breakEven: "Break even after",
  perMonth: " / mo",
  unassigned: "Unassigned property",
  occupancyIntro: "I can't compare this loan until I know how the property is used.",
  occupancyUse: "How is it used?",
  occupancyRentalType: "What kind of rental?",
  occupancySave: "Set and re-check",
  occupancySaving: "Saving...",
  occupancySaved: "Property updated. Checking this loan now.",
  occupancyFailed: "I couldn't update the property. Want me to try again?",
  occupancyViewOnly: "You have view-only access, so I can't change the property.",
  occupancyLostConnection: "I couldn't reach the server. Check your connection and try again.",
} as const;
