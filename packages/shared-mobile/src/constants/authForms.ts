/** The backend's shortest allowed password (`min_password_length` in platform_shared/auth/user_manager.py). */
export const PASSWORD_MIN_LENGTH = 12;

/** Copy the sign-up and forgot-password screens share, as on the website. */
export const AUTH_FORM_COPY = {
  emailRequired: "Enter your email.",
  emailInvalid: "Enter a valid email address.",
  captchaRejected: "We couldn't confirm the security check. Complete it again and retry.",
  captchaExpired: "The security check expired. Complete it again and retry.",
  rateLimited: "Too many attempts. Wait a few minutes, then try again.",
  unexpected: "Something went wrong. Please try again.",
  unreachable: (appName: string) => `Can't reach ${appName}. Check your connection and try again.`,
  sentTitle: "Check your inbox",
  backToSignIn: "Back to sign in",
} as const;

export const REGISTER_COPY = {
  title: "Create an account",
  nameLabel: "Name",
  nameHint: "Optional",
  passwordHint: `At least ${PASSWORD_MIN_LENGTH} characters.`,
  passwordTooShort: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  agreement: "I agree to use this service responsibly.",
  agreementRequired: "Agree to use the service responsibly to create an account.",
  emailTaken: "An account with this email already exists. Sign in instead.",
  unavailable: "Sign-up is temporarily unavailable. Try again later.",
  submit: "Sign up",
  submitting: "Creating account...",
  haveAccount: "Already have an account? Sign in",
  sent: (email: string) =>
    `We sent a verification link to ${email}. Click the link in that email to activate your account, then sign in.`,
} as const;

export const FORGOT_PASSWORD_COPY = {
  title: "Reset your password",
  intro: "Enter your account email and we'll send you a link to reset your password.",
  unavailable: "Password resets are temporarily unavailable. Try again later.",
  submit: "Send reset link",
  submitting: "Sending...",
  sent: (email: string) =>
    `If an account exists for ${email}, we've sent a password reset link. Check your inbox and spam folder.`,
  opensOnWebsite: "The link opens on the website, where you choose a new password. Then sign in here with it.",
} as const;
