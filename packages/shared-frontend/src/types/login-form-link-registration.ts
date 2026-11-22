/** The app has its own sign-up page; LoginForm links to it instead of showing a tab. */
export interface LoginFormLinkRegistration {
  /** The app's register page, with any `returnTo` already on it (see withReturnTo). */
  registerHref: string;
  onRegister?: never;
  defaultTab?: never;
  passwordMinLength?: never;
  registerCaptchaSlot?: never;
  registerCaptchaReady?: never;
}
