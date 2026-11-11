import type { ScreeningQuestion } from "../types/screening-answer/screening-question";

/**
 * Every question a screening answer can be saved for, standard ones first. Mirrors `ALLOWED_KEYS`
 * and `EEOC_KEYS` in backend/app/core/screening_questions.py.
 */
export const SCREENING_QUESTIONS: readonly ScreeningQuestion[] = [
  { key: "work_auth_us", label: "Work authorization (US)", eeoc: false },
  { key: "require_sponsorship", label: "Requires visa sponsorship", eeoc: false },
  { key: "willing_to_relocate", label: "Willing to relocate", eeoc: false },
  { key: "salary_expectation", label: "Salary expectation", eeoc: false },
  { key: "notice_period", label: "Notice period", eeoc: false },
  { key: "years_experience", label: "Total years of experience", eeoc: false },
  { key: "highest_education", label: "Highest education level", eeoc: false },
  { key: "linkedin_url", label: "LinkedIn URL", eeoc: false },
  { key: "github_url", label: "GitHub URL", eeoc: false },
  { key: "portfolio_url", label: "Portfolio URL", eeoc: false },
  { key: "available_start_date", label: "Available start date", eeoc: false },
  { key: "cover_letter", label: "Cover letter", eeoc: false },
  { key: "referral_source", label: "Referral source", eeoc: false },
  { key: "willing_to_travel", label: "Willing to travel", eeoc: false },
  { key: "has_drivers_license", label: "Has driver's license", eeoc: false },
  { key: "felony_conviction", label: "Felony conviction", eeoc: false },
  { key: "non_compete_agreement", label: "Non-compete agreement", eeoc: false },
  { key: "eeoc_gender", label: "Gender (EEOC)", eeoc: true },
  { key: "eeoc_race_ethnicity", label: "Race / ethnicity (EEOC)", eeoc: true },
  { key: "eeoc_veteran_status", label: "Veteran status (EEOC)", eeoc: true },
  { key: "eeoc_disability_status", label: "Disability status (EEOC)", eeoc: true },
  { key: "eeoc_protected_class", label: "Protected class (EEOC)", eeoc: true },
];
