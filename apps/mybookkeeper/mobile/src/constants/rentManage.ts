export const RENT_MANAGE_MESSAGES = {
  setUp: "Set up rent",
  editSchedule: "Edit schedule",
  addCharge: "Add charge",
  cancel: "Cancel",
  viewOnlyHint: "You have view-only access.",

  scheduleIntro:
    "Rent is charged on its own rhythm and settled by whatever payments arrive. A tenant billed monthly can pay weekly. Each payment is applied to the oldest unpaid period, so the balance stays right without anyone reconciling by hand.",
  scheduleTitleNew: "Set up rent",
  scheduleTitleEdit: "Edit rent schedule",
  amount: "Rent amount ($)",
  amountHint: "What is owed per period, not what the tenant hands over each time.",
  cadence: "Charged",
  cadenceHint: "How often rent comes due. Payments can arrive on any rhythm.",
  start: "First period starts",
  end: "Last day (optional)",
  endHint: "Set this when the tenancy ends. A part-period is charged pro rata.",
  endBeforeStart: "The last day can't be before the first day.",
  grace: "Late after (days into the period, optional)",
  graceHint:
    "Leave blank for a tenant paying in instalments. Rent then counts as late only if the period ends short. Set 5 to flag anything still unpaid five days in.",
  graceInvalid: "Use a whole number of days from 0 to 365, or leave it blank.",
  notes: "Notes",
  saveNew: "Set up rent",
  saveEdit: "Update schedule",
  saving: "Saving…",
  scheduleSaved: "Rent schedule saved.",
  scheduleUpdated: "Rent schedule updated.",
  removeSchedule: "Remove schedule",
  removing: "Removing…",
  scheduleRemoved: "Rent schedule removed.",
  removeScheduleTitle: "Remove this rent schedule?",
  removeScheduleBody:
    "This retires every charge the schedule generated. Use it for a schedule entered by mistake. If the tenancy simply ended, set a last day instead.",

  chargeTitle: "Add a charge",
  chargeAmount: "Amount ($)",
  chargeDue: "Due",
  chargeDueHint: "Payments settle charges oldest first, so this sets its place in the queue.",
  chargeKind: "Kind",
  chargeKindHint: "Rent itself is not listed. It comes from the schedule, so adding it here would bill the period twice.",
  chargeDescription: "Description",
  chargeDescriptionHint: "For example, August electricity share.",
  adding: "Adding…",
  chargeAdded: "Charge added.",

  waiveTitle: "Waive this charge",
  waiveReason: "Reason",
  waiveReasonHint: "Kept with the charge so whoever reads the account next knows why.",
  waive: "Waive",
  waiveCharge: "Waive charge",
  waiving: "Waiving…",
  chargeWaived: "Charge waived.",
  restore: "Restore",
  restoring: "Restoring…",
  chargeRestored: "Charge restored.",
  removeCharge: "Remove charge",
  chargeRemoved: "Charge removed.",
  removeChargeTitle: "Remove this charge?",
  removeChargeBody: "It stops counting toward the balance. Payments already applied to it move on to the next unpaid charge.",
  removeChargeOnlyOneOff: "Rent from the schedule can be waived but not removed. It would come right back.",
  confirmRemove: "Remove",

  discardTitle: "Discard what you typed?",

  viewOnly: "You have view-only access.",
  demo: "Demo accounts can't change rent.",
  gone: "I can't find that anymore. Pull down to refresh.",
  lostConnection: "I lost the connection, so I'm not sure that saved. Check the rent section, then try again if it didn't.",
  retry: "I couldn't save that. Want to try again?",
  scheduleOverlaps: "That overlaps a rent schedule already set up for this tenant. End the earlier one first.",
  scheduleBadDates: "I couldn't save that. Check the dates and amounts.",
  chargeInvalid: "I couldn't add that charge. Check the amount and due date.",
} as const;

export const RENT_DESCRIPTION_MAX_LENGTH = 255;
export const RENT_WAIVE_REASON_MAX_LENGTH = 2000;

export function waiveBody(amount: string, period: string): string {
  return `${amount} for ${period} stops counting toward the balance. Payments already applied to it move on to the next unpaid charge.`;
}

export function scheduleFixedTerms(terms: string): string {
  return `${terms}. To change the rent, end this schedule and add a new one from the day the new rate applies. That keeps past periods at the rate they were charged.`;
}

export function chargeActionLabel(action: string, title: string): string {
  return `${action}, ${title}`;
}
