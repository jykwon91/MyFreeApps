import { TEXT_HANDOFF_HOLDER } from "@mybookkeeper/api-client/constants/rentReminderLabels";

export const RENT_REMINDERS_SHOWN_AT_FIRST = 3;
/** Long enough for a send that lost its answer to show up in the history. */
export const LOST_SEND_HOLD_MS = 30_000;
/** How a message names a tenant whose first name isn't known. */
export const UNNAMED_TENANT = "them";

export const REMINDER_MESSAGES = {
  section: "Rent reminders",
  loading: "Loading rent reminders",
  loadingNext: "Loading the next reminder",
  loadingHistory: "Loading the reminders sent",
  couldntLoad: "I couldn't load the rent reminders.",
  couldntLoadNext: "I couldn't load the next reminder.",
  couldntLoadHistory: "I couldn't load the history.",
  tryAgain: "Try again",
  needsSchedule: "I'm not sending this tenant any rent reminders. Their amount comes from the rent schedule, so set that up too.",
  notSending: "I'm not sending this tenant any rent reminders.",
  tenancyEnded: "This tenancy has ended, so I'm not sending reminders.",
  next: "Next reminder",
  nextWhenBack: "Next reminder (when you turn them back on)",
  paused: "Paused",
  pausedNote: "Reminders are paused. I won't send anything on my own.",
  pausedCantSend: "Turn reminders back on to send.",
  nothingDue: "There's no upcoming rent to remind about. That happens when the rent schedule has ended or the next period is waived.",
  sendingSoon: "Sending soon",
  dontCheckPaid: "I don't check whether they've paid.",
  cantSendAgain: "Email and text always go together, so I can't send this one again.",
  sending: "Sending…",
  sendHint: "Asks you to confirm first",
  send: "Send",
  confirmWarning: "This goes out right away, can't be unsent, and I can't send another for this due date.",
  sendAgain: "Send again",
  possiblySentRefused: "The last try may already have reached them, so I didn't send anything. Check first, then send again.",
  noSms: "Text reminders aren't set up on the server, so I can't send.",
  history: "History",
  noHistory: "No reminders sent yet.",
  showFewer: "Show fewer",
  changed: "That changed since you looked. Here's the new one.",
  alreadySent: "That reminder was already sent.",
  tooMany: "That's a lot of reminders in a short time. Try again in a while.",
  demo: "Demo accounts can't send reminders.",
  gone: "That tenant or plan is gone.",
  cantGoOut: "That can't go out right now. Here's where it stands.",
  lostButSent: "I lost the connection, but the server has the reminder. Check the history below to see how it went.",
  lostUnknown: "I lost the connection and I can't tell if that went out. Nothing shows in the history yet, so check again in a minute before trying again.",
  unreachable: "I can't reach the server, so I'm not sure that went out. Check the history before trying again.",
  textHandedOff: `The text is with ${TEXT_HANDOFF_HOLDER}, and I'll show in the history whether it went out.`,
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

/** `textLine` says where the text is: with the phone, or gone out. */
export function sentBoth(textLine: string): string {
  return `I sent the email. ${textLine}`;
}

export function sentEmail(name: string | null): string {
  return `I sent the email to ${name ?? UNNAMED_TENANT}.`;
}

export function emailOnlyWent(reason: string, name: string | null): string {
  return `The email went out, but the text didn't. ${reason}. I can't resend it from here. Text ${name ?? UNNAMED_TENANT} yourself if you need to.`;
}

/** `textLine` says where the text is: with the phone, or gone out. */
export function onlyEmailFailed(reason: string, textLine: string): string {
  return `The email didn't go out. ${reason}. ${textLine} I can't resend just the email.`;
}

export function neitherWent(reason: string): string {
  return `Neither the email nor the text went out. ${reason}. You can try again once that's fixed.`;
}

/** Both failed for different reasons: naming only one would leave the other to fail again. */
export function neitherWentEach(emailReason: string, textReason: string): string {
  return `Neither the email nor the text went out. Email: ${emailReason}. Text: ${textReason}. You can try again once those are fixed.`;
}

export function oneFailed(channel: string, reason: string): string {
  return `The ${channel} didn't go out. ${reason}. You can try again once that's fixed.`;
}

export function channelWent(channel: string): string {
  return `The ${channel} went out.`;
}

export function channelDidntGo(channel: string, reason: string): string {
  return `The ${channel} didn't go out. ${reason}.`;
}

/** A failed send that may still have reached them: never "didn't go out", never "try again". */
export function channelMayHaveGone(channel: string, reason: string): string {
  return `I can't tell if the ${channel} went out. ${reason}.`;
}
