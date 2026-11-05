export const CLIPBOARD_CLEAR_MS = 60_000;
export const RECOVERY_CODE_SHARE_SEPARATOR = "\n";
export const CHECKBOX_ON_GLYPH = "☑";
export const CHECKBOX_OFF_GLYPH = "☐";

export const TWO_STEP_DETAILS = {
  alreadyOn: "2FA is already enabled",
  alreadyOff: "2FA is not enabled",
  notStarted: "No 2FA setup in progress. Cancel and start again.",
  wrongPassword: "Incorrect password",
} as const;

export const TWO_STEP_MESSAGES = {
  heading: "Two-step sign-in",
  offBody: (whatItProtects: string) =>
    `Off. A code from an authenticator app protects ${whatItProtects} if someone learns your password.`,
  turnOn: "Turn on two-step sign-in",
  onBody: "On. I'll ask for a code from your authenticator app each time you sign in. This phone stays signed in.",
  onCodesNote:
    "I only show recovery codes once, when you turn this on. To get new ones, turn two-step sign-in off, then on again.",
  turnOff: "Turn off two-step sign-in",
  websiteNote: "Display name and data export are on the website.",
  openWebsite: "Open on the website",

  loadFailed: "I couldn't load your security settings.",
  loadFailedServer: "Something went wrong on my side. Try again in a moment.",
  loadFailedConnection: "Check your connection and try again.",
  tryAgain: "Try again",
  refreshFailed: "I couldn't check for changes, so this may be out of date.",

  passwordHeading: "Enter your password",
  passwordBody: "So I know it's you before I set this up.",
  password: "Password",
  wrongPassword: "That password isn't right.",
  continue: "Continue",
  gettingReady: "Getting ready…",
  startFailed: "I couldn't start that. Try again.",
  deleteOlderEntry: (appName: string) => `Delete any older ${appName} entry in your authenticator app.`,
  alreadyOnToast: "Two-step sign-in is already on.",
  tooManyTries: "Too many tries, so sign-in is blocked for now. Wait a while, then try again.",

  addHeading: (appName: string) => `Add ${appName} to your authenticator app`,
  addBody: (appName: string) => `Tap the button and your authenticator app will add ${appName} for you.`,
  openAuthenticator: "Open my authenticator app",
  noAuthenticator:
    "I couldn't find an authenticator app on this phone. Install one, or copy the key and add it yourself. Some apps, like Google Authenticator, can't use the kind of code I set up. 1Password, Aegis and Bitwarden can.",
  showKey: "Show the key instead",
  hideKey: "Hide the key",
  copyKey: "Copy key",
  keyCopied: "Key copied. I'll try to clear it in a minute.",
  keyScreenshotsOff: "Screenshots are off while the key is showing.",
  copyFailed: "I couldn't copy that. Try again.",
  shareFailed: "I couldn't share that. Try again.",
  settings: (algorithm: string, digits: number, period: number) =>
    `Enter these settings: time-based, ${algorithm}, ${digits} digits, ${period} seconds.`,
  codeLabel: "Enter the 6-digit code from your app",
  confirmTurnOn: "Turn on",
  turningOn: "Turning on…",
  wrongSetupCode: "That code didn't work. Each code works once, so wait for the next one in your app.",
  restarted: "That setup is no longer open, so let's start again.",
  notThrough: "That didn't go through. Enter a new code.",

  lostOnHeading: "Two-step sign-in is on, but I didn't get your recovery codes. I can't show them again.",
  lostOnNote: "If you lose your authenticator app, resetting your password on the website turns two-step sign-in off.",
  startOver: "Turn it off and start over",
  keepOn: "Keep it on",
  unsure: "I'm not sure that worked.",
  checkAgain: "Check again",
  checking: "Checking…",

  codesHeading: "Save your recovery codes",
  codesBody: "Each code works once if you can't use your authenticator app. I can't show these again.",
  screenshotsOff: "Screenshots are off here so the codes don't end up in your photos.",
  share: "Share",
  copyAll: "Copy all",
  codesCopied: "Copied. I'll try to clear it in a minute.",
  saved: "I've saved these codes somewhere safe",
  done: "Done",
  leaveTitle: "Leave without saving your codes?",
  leaveBody:
    "I can't show them again. If you lose your authenticator app, these are your way back in, other than resetting your password on the website.",
  stay: "Stay",
  leaveAnyway: "Leave anyway",
  stillTurningOnTitle: "I'm still turning this on",
  stillTurningOnBody: "Stay here a moment. Your recovery codes only show once, and they're on their way.",

  turnOffTitle: "Turn off two-step sign-in?",
  turnOffBody: "Anyone with your password will be able to sign in. Your recovery codes will stop working.",
  cancel: "Cancel",
  confirmTurnOff: "Turn off",
  turningOff: "Turning off…",
  turnOffCodeHeading: "Enter a code from your authenticator app.",
  turnOffCodeLabel: "6-digit code",
  turnOffNote:
    "Lost your authenticator app? Reset your password on the website. That turns two-step sign-in off and signs you out everywhere.",
  turnedOff: "Two-step sign-in is off.",
  alreadyOff: "Two-step sign-in was already off.",
  wrongTurnOffCode: "That code didn't work. Each code works once, so wait for the next one.",
  turnOffUnsure: "I'm not sure that worked. Pull down to refresh and check.",
} as const;
