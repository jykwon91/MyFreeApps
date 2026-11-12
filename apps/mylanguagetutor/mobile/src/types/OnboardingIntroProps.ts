export interface OnboardingIntroProps {
  /** Such as "Step 1 of 2"; left out when the step isn't part of onboarding. */
  step?: string;
  heading: string;
  intro: string;
}
