/** Fixed copy for personal transfers, shared by the website and the phone. */
export const PERSONAL_TRANSFER_LABELS = {
  markOnCard: "Personal transfer",
  markOnCardPending: "Marking…",
  markOnTransaction: "Mark as personal transfer",
  markHelp: "Money from or to a friend or relative. It stays on file but won't count as income or spending.",
  marked: "This is a personal transfer. It doesn't count towards any total.",
  unmark: "Not a personal transfer",
  unmarkPending: "Putting it back…",
  forgetSenderToggle: (name: string) => `Also stop skipping ${name}`,
  sendersHeading: "Senders I skip",
  sendersHelp: "Payments from these people are marked as personal transfers and never show up here.",
  sendersEmpty: "No remembered senders. When you mark a payment as a personal transfer, I'll list the sender here.",
  sendersLoadError: "I couldn't load the senders I skip.",
  sendersShowAll: (count: number) => `Show all ${count}`,
  sendersShowFewer: "Show fewer",
  forget: "Stop skipping",
  forgetAria: (name: string) => `Stop skipping ${name}`,
  forgetConfirmTitle: (name: string) => `Stop skipping ${name}?`,
  forgetConfirmBody: (name: string) =>
    `Future payments from ${name} will show up in Payment Review again. Payments already marked stay marked.`,
  markFailed: "I couldn't mark that as a personal transfer. Want to try again?",
  unmarkFailed: "I couldn't put that back. Want to try again?",
  forgetFailed: "I couldn't stop skipping that sender. Want to try again?",
} as const;

/** How many remembered senders show before "Show all". */
export const PERSONAL_TRANSFER_SENDERS_COLLAPSED = 10;
