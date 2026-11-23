import { unsureRepeatableMessage } from "../utils/unsureRepeatableMessage";

/** The words for the signed-in devices list, the same on the website and the phone. */
export const DEVICE_SESSION_MESSAGES = {
  heading: "Devices signed in",
  loading: "Loading your signed-in devices",
  loadFailed: "Couldn't load your devices. Check your connection and try again.",
  tryAgain: "Try again",
  tryingAgain: "Trying again...",
  empty: "No phones signed in",
  thisDevice: "This device",
  unknownDevice: "Unknown device",
  signOut: "Sign out",
  signingOut: "Signing out...",
  cancel: "Cancel",
  confirmBody: "It won't be able to renew its sign-in, but it can stay signed in for up to 30 minutes.",
  passwordAdvice: "If you think someone else has your password, reset it too.",
  passwordAdviceOnPhone: "If you think someone else has your password, reset it on the website too.",
  alreadyGone: "That device was already signed out.",
} as const;

export function devicesDescription(appName: string): string {
  return `Phones and tablets signed in to your ${appName} account. Signing one out stops it renewing its sign-in, but it can stay signed in for up to 30 minutes.`;
}

export function signOutDeviceLabel(name: string): string {
  return `Sign out ${name}`;
}

export function confirmSignOutDeviceTitle(name: string): string {
  return `Sign out ${name}?`;
}

export function deviceSignedOutMessage(name: string): string {
  return `Signed out ${name}. It may stay signed in for up to 30 minutes.`;
}

export function deviceSignOutFailedMessage(name: string): string {
  return `Couldn't sign out ${name}. Check your connection and try again.`;
}

/** Signing a device out again after a lost answer is harmless: one that already went answers "already signed out". */
export function deviceSignOutUnsureMessage(name: string): string {
  return unsureRepeatableMessage(`${name} was signed out`);
}
