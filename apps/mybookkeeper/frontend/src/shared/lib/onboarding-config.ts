import type { OnboardingData } from "@/shared/types/onboarding/onboarding-data";

export const STEP_LABELS = ["Your situation", "Filing status", "Dependents"] as const;

export const TOTAL_STEPS = STEP_LABELS.length;

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
  tax_situations: [],
  filing_status: null,
  dependents_count: 0,
};
