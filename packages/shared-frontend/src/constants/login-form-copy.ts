/** What LoginForm says. */
export const LOGIN_FORM_COPY = {
  signInTab: "Sign In",
  registerTab: "Create Account",
  signIn: "Sign In",
  signingIn: "Signing in...",
  createAccount: "Create Account",
  creatingAccount: "Creating account...",
  email: "Email",
  password: "Password",
  showPassword: "Show password",
  hidePassword: "Hide password",
  defaultTrust: "Your job search data stays private. No recruiter access, no data resale, ever.",
} as const;

/** What LoginForm says around the link to an app's own sign-up page. */
export const LOGIN_FORM_REGISTER_LINK_COPY = {
  heading: "Sign in",
  prompt: "Don't have an account?",
  link: "Create account",
} as const;

/** The password length LoginForm's create-account form asks for when the app names none. */
export const LOGIN_FORM_DEFAULT_PASSWORD_MIN_LENGTH = 12;
