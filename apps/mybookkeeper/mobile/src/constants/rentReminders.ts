export const RENT_REMINDERS_SHOWN_AT_FIRST = 3;
/** Long enough for a send that lost its answer to show up in the history. */
export const LOST_SEND_HOLD_MS = 30_000;

export const REMINDER_MESSAGES = {
  section: "Rent reminders",
  loading: "Loading rent reminders",
  couldntLoad: "I couldn't load the rent reminders.",
  couldntLoadNext: "I couldn't load the next reminder.",
  couldntLoadHistory: "I couldn't load the history.",
  tryAgain: "Try again",
  needsSchedule: "Rent reminders need a rent schedule first. The next reminder's amount comes from it.",
  setUpOnWebsite: "Set up on the website",
  notSending: "I'm not sending this tenant any rent reminders. You can turn them on from the website.",
  turnOnOnWebsite: "Turn on on the website",
  tenancyEnded: "This tenancy has ended, so I'm not sending reminders.",
  next: "Next reminder",
  nextWhenBack: "Next reminder (when you turn them back on)",
  paused: "Paused",
  pausedNote: "Reminders are paused. I won't send anything on my own.",
  pausedCantSend: "Turn reminders back on from the website to send.",
  nothingDue: "There's no upcoming rent to remind about. That happens when the rent schedule has ended or the next period is waived.",
  sendingSoon: "Sending soon",
  dontCheckPaid: "I don't check whether they've paid.",
  cantSendAgain: "Email and text always go together, so I can't send this one again.",
  sending: "Sending…",
  sendHint: "Asks you to confirm first",
  send: "Send",
  confirmWarning: "This goes out right away, can't be unsent, and I can't send another for this due date.",
  noSms: "Text reminders aren't set up on the server, so I can't send.",
  history: "History",
  noHistory: "No reminders sent yet.",
  showFewer: "Show fewer",
  changeOnWebsite: "To change when or how I remind them, use the website.",
  openWebsite: "Open the website",
  changed: "That changed since you looked. Here's the new one.",
  alreadyWent: "That reminder already went out.",
  tooMany: "That's a lot of reminders in a short time. Try again in a while.",
  demo: "Demo accounts can't send reminders.",
  gone: "That tenant or plan is gone.",
  cantGoOut: "That can't go out right now. Here's where it stands.",
  lostButSent: "I lost the connection, but the server has the reminder. Check the history below to see how it went.",
  lostUnknown: "I lost the connection and I can't tell if that went out. Nothing shows in the history yet, so check again in a minute before trying again.",
  unreachable: "I can't reach the server, so I'm not sure that went out. Check the history before trying again.",
  textWithPhone: "The text is with your phone and I'll show Delivered or Failed in the history.",
} as const;

export function sendNowLabel(firstName: string | null): string {
  return firstName ? `Send now to ${firstName}` : "Send now";
}

export function confirmTitle(name: string | null): string {
  return `Send this reminder to ${name ?? "this tenant"}?`;
}

export function goesOut(moment: string): string {
  return `Goes out ${moment}`;
}

export function goesBy(channels: string): string {
  return `Goes by ${channels}.`;
}

export function sentFor(date: string, channels: string): string {
  return `Sent for ${date} · ${channels}`;
}

export function moneyDue(amount: string, date: string): string {
  return `${amount} due ${date}`;
}

export function noEmailWontGo(firstName: string | null): string {
  return `${firstName ?? "This tenant"} has no email on file, so the email won't go out.`;
}

export function addEmailFirst(firstName: string | null): string {
  return firstName ? `Add an email to ${firstName}'s record first.` : "Add an email to their record first.";
}

export function noPhoneWontGo(firstName: string | null): string {
  return `${firstName ?? "This tenant"} has no phone number on file, so the text won't go out.`;
}

export function addPhoneFirst(firstName: string | null): string {
  return firstName ? `Add a phone number to ${firstName}'s record first.` : "Add a phone number to their record first.";
}

export function showAllReminders(count: number): string {
  return `Show all ${count} reminders`;
}

export function sentBoth(): string {
  return `I sent the email. ${REMINDER_MESSAGES.textWithPhone}`;
}

export function sentEmail(name: string | null): string {
  return `I sent the email to ${name ?? "them"}.`;
}

export function emailOnlyWent(reason: string, name: string | null): string {
  return `The email went out, but the text didn't. ${reason}. I can't resend it from here. Text ${name ?? "them"} yourself if you need to.`;
}

export function textOnlyWent(reason: string): string {
  return `The text went out, but the email didn't. ${reason}. I can't resend just the email.`;
}

export function neitherWent(reason: string): string {
  return `Neither the email nor the text went out. ${reason}. You can try again once that's fixed.`;
}

export function oneFailed(channel: string, reason: string): string {
  return `The ${channel} didn't go out. ${reason}. You can try again once that's fixed.`;
}
