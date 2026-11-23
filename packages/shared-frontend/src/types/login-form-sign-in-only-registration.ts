/** The app has no sign-up at all (a single-user app); LoginForm shows only the sign-in form. */
export interface LoginFormSignInOnlyRegistration {
  signInOnly: true;
  onRegister?: never;
  registerHref?: never;
  defaultTab?: never;
  passwordMinLength?: never;
  registerCaptchaSlot?: never;
  registerCaptchaReady?: never;
}
