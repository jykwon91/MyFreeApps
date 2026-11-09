export const LISTING_CHANNEL_MESSAGES = {
  heading: "Channels",
  noneHeading: "Not on any channel yet.",
  noneBody: "Connect this listing to a booking channel to share its calendar.",
  noneViewOnlyBody: "Someone with edit access can add channels.",
  add: "Add a channel",
  couldntLoad: "I couldn't load this listing's channels.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  channelsFailed: "I couldn't load the list of channels to add.",
  noMoreChannels: "Every channel is already linked to this listing.",
  copyIcal: "Copy iCal URL",
  icalCopied: "iCal URL copied. Paste it into the channel's import-calendar field.",
  copyFailed: "I couldn't copy that.",
  edit: "Edit",
  remove: "Remove",
  removing: "Removing…",
  removed: "Channel removed.",
  alreadyRemoved: "That channel was already removed.",
  removeBody: "This stops syncing this listing's calendar with that channel. The listing on the channel isn't touched.",
  noInbound: "No inbound iCal URL set. Bookings won't import automatically.",
  notSynced: "Not synced yet",
  syncFailed: "Last sync failed",
  newTitle: "Add a channel",
  editTitle: "Edit channel",
  channel: "Channel",
  chooseChannel: "Which channel?",
  externalUrl: "Listing URL on the channel",
  externalId: "Listing ID on the channel (optional)",
  icalImportUrl: "Channel's calendar export URL (optional)",
  icalImportHint: "Paste it so bookings on that channel come back every 15 minutes.",
  noCalendarFeed: "doesn't offer a calendar feed, so I can only store the link. Bookings won't sync automatically.",
  outboundUrl: "Outbound iCal URL",
  outboundHint: "Paste this into the channel's import-calendar field.",
  addSubmit: "Add channel",
  adding: "Adding…",
  save: "Save changes",
  saving: "Saving…",
  added: "Channel added. Copy the outbound iCal URL into the channel next.",
  saved: "Channel saved.",
  conflict: "That channel is already linked to this listing.",
  channelGone: "That channel isn't available anymore.",
} as const;

export function removeChannelTitle(name: string): string {
  return `Remove ${name}?`;
}

export function syncedText(when: string | null): string {
  return `Synced ${when ?? "recently"}`;
}
