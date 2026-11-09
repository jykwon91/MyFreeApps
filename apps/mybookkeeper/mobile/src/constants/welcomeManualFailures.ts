export const WELCOME_MANUAL_FAILURE_MESSAGES = {
  viewOnly: "You have view-only access, so I can't change this.",
  invalid: "Something in there isn't right. Check the fields and try again.",
  tooBig: "That photo is too big. I can take up to 10MB each.",
  badType: "I can't take that kind of file. Use a JPEG or PNG photo.",
  noStorage: "Photo storage isn't set up for this workspace yet, so I couldn't upload that.",
  demoEmail: "Demo accounts can't send email.",
  tryAgain: "Want to try again?",
} as const;

export function offlineMessage(doing: string): string {
  return `I can't reach the server, so I couldn't ${doing}.`;
}

export function goneMessage(noun: string): string {
  return `I can't find that ${noun} anymore. It may have been deleted.`;
}

export function photoLimitFallback(max: number): string {
  return `A section can have at most ${max} photos.`;
}

export function notSureItSavedMessage(plural: string): string {
  return `I'm not sure that saved. Check your ${plural} before trying again, so you don't end up with two.`;
}

export function couldntMessage(doing: string): string {
  return `I couldn't ${doing}. Want to try again?`;
}

export function limitFallback(noun: string): string {
  return `You've reached the limit for ${noun}.`;
}
