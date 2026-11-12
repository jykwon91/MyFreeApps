import type { Language } from "@mylanguagetutor/api-client/types/catalog/language";
import type { Scenario } from "@mylanguagetutor/api-client/types/catalog/scenario";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";
import type { UsageToday } from "@mylanguagetutor/api-client/types/tutor/usage-today";

export const SPANISH: Language = {
  code: "es",
  display_name: "Spanish",
  dialect_label: "Latin American",
  stt_locale: "es-MX",
  tts_locale: "es-MX",
};

export const PROFILE: Profile = { language_code: "es", level: "some_phrases", updated_at: "2026-11-01T00:00:00Z" };

export const SCENARIOS: Scenario[] = [
  { slug: "greetings", title: "Greetings", goal: "Say hello and introduce yourself.", goals: ["Greet"], order: 1 },
  { slug: "cafe", title: "At the cafe", goal: "Order a drink and a snack.", goals: ["Order"], order: 4 },
];

export const USAGE_LEFT: UsageToday = { remaining_fraction: 0.6, cap_reached: false, tutor_available: true };
export const USAGE_USED_UP: UsageToday = { remaining_fraction: 0, cap_reached: true, tutor_available: true };
