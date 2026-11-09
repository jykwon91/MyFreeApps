export const REMINDER_SETUP_MESSAGES = {
  setUp: "Set up reminders",
  edit: "Edit reminders",
  setUpIntro: "Send this tenant a friendly heads-up before rent is due, by email or by text from your own phone.",
  titleNew: "Set up reminders",
  titleEdit: "Edit reminders",
  tenantPays: "Tenant pays",
  monthly: "Monthly",
  weekly: "Weekly",
  monthlyNote: "Due on the 1st. One reminder for the whole month's rent.",
  weeklyNote: "The month's rent split evenly across the tenant's pay days.",
  weekday: "Rent is due every",
  daysBefore: "Days before it's due",
  daysHintOk: "0 sends it the morning rent is due.",
  sendTime: "At (Central time)",
  timeHintOk: "Reminders only go out between 9am and 8pm.",
  timeHintBad: "Choose a time between 9:00 AM and 7:59 PM.",
  sendBy: "Send by",
  email: "Email",
  noEmail: "No email on this tenant's record yet.",
  sms: "Text message",
  smsUnavailable: "Not set up on this server yet. Texts need the httpSMS phone relay.",
  noPhone: "No phone number on this tenant's record yet.",
  needChannel: "Turn on email or text so the reminder has somewhere to go.",
  howToPay: "How to pay",
  howToPayHint: "Added to the end of the message as \"Pay via …\".",
  howToPayPlaceholder: "Zelle to you@example.com",
  fixedAmount: "Fixed amount ($, optional)",
  fixedAmountHint: "Leave empty to quote the amount from the rent schedule.",
  fixedAmountInvalid: "Use an amount above zero, or leave it empty.",
  remindersOn: "Reminders on",
  remindersOnNote: "Turn off to pause. Nothing is sent on its own while paused.",
  saveNew: "Turn on reminders",
  saveEdit: "Save reminders",
  saving: "Saving…",
  cancel: "Cancel",
  savedNew: "Rent reminders are on.",
  savedEdit: "Reminder settings saved.",
  alreadyExists: "This tenant already has reminders. Pull down to refresh and edit them.",
  cantSave: "I couldn't save those settings. Check them and try again.",
} as const;

export function daysHintBad(max: number): string {
  return `Pick 0 to ${max} days.`;
}

export function smsFrom(number: string, isEncrypted: boolean): string {
  return `From your phone, ${number}${isEncrypted ? " (encrypted)" : ""}.`;
}
