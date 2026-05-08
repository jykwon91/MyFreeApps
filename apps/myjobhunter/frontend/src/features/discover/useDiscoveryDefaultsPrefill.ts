import { useEffect, useMemo, useRef } from "react";
import { useGetProfileQuery } from "@/lib/profileApi";
import { useListSkillsQuery } from "@/lib/skillsApi";
import { useListWorkHistoryQuery } from "@/lib/workHistoryApi";
import type { Profile } from "@/types/profile/profile";

type DatePosted = "all" | "today" | "3days" | "week" | "month";
type Experience =
  | ""
  | "no_experience"
  | "under_3_years_experience"
  | "more_than_3_years_experience"
  | "no_degree";

interface PrefillSetters {
  setRoles: (next: string[]) => void;
  setRemoteOnly: (next: boolean) => void;
  setMinSalary: (next: string) => void;
  setCountry: (next: string) => void;
  setDatePosted: (next: DatePosted) => void;
  setEmploymentType: (next: string) => void;
  setExperience: (next: Experience) => void;
  setExcludedIndustryChips: (next: string[]) => void;
  setExcludedKeywords: (next: string[]) => void;
}

interface PrefillResult {
  /** Profile object (for read-modify-write of discovery_defaults on save). */
  profile: Profile | undefined;
  /** Most-recent distinct work history titles (autocomplete suggestions). */
  recentRoleSuggestions: string[];
  /** Top profile.skills (autocomplete suggestions). */
  skillSuggestions: string[];
  /** True while any of the three prefill queries is in flight. */
  isPrefillLoading: boolean;
  /** True after the one-shot prefill has run for this open session. */
  didPrefill: boolean;
  /** Reset the prefill latch on dialog close. */
  resetPrefill: () => void;
}

/**
 * Drive the one-shot prefill of the New Saved Search dialog from the
 * operator's profile + saved discovery_defaults.
 *
 * Why this is its own hook (extracted from NewSavedSearchDialog.tsx):
 *
 * - Cuts the dialog component by ~80 lines and 4 hooks of pure
 *   boilerplate-state management.
 * - Replaces the `didPrefill` useState (a "did this run" flag — same
 *   anti-pattern the operator flagged on the polling code, PR #418)
 *   with a ``useRef``. Refs are the right primitive for "this happened
 *   already" markers; useState forces an unnecessary re-render every
 *   time the latch flips.
 * - Owns three RTK Query hooks (profile, skills, work history) instead
 *   of having them sprawl in the dialog. The dialog now consumes one
 *   hook and gets back what it needs.
 *
 * Preference order applied to each field:
 *   1. Saved discovery_defaults (operator's persisted choice)
 *   2. Heuristic from profile fields (seniority → experience, etc.)
 *   3. Static default
 */
export function useDiscoveryDefaultsPrefill(
  open: boolean,
  setters: PrefillSetters,
): PrefillResult {
  const { data: profile, isLoading: profileLoading } = useGetProfileQuery(undefined, { skip: !open });
  const { data: skillsData, isLoading: skillsLoading } = useListSkillsQuery(undefined, { skip: !open });
  const { data: workHistoryData, isLoading: workHistoryLoading } = useListWorkHistoryQuery(undefined, {
    skip: !open,
  });
  const isPrefillLoading = open && (profileLoading || skillsLoading || workHistoryLoading);

  // useRef instead of useState — flipping this latch shouldn't trigger
  // a re-render. The dialog reads the value to decide whether to show
  // the "Pre-filled from your profile" banner; that read happens via
  // a derived boolean `prefillBannerVisible`, NOT via useState.
  const didPrefillRef = useRef(false);

  const recentRoleSuggestions = useMemo(() => {
    if (!workHistoryData?.items) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const w of workHistoryData.items) {
      const t = w.title?.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= 3) break;
    }
    return out;
  }, [workHistoryData]);

  const skillSuggestions = useMemo(() => {
    if (!skillsData?.items) return [];
    return skillsData.items
      .map((s) => s.name)
      .filter((n): n is string => !!n && n.trim().length > 0)
      .slice(0, 8);
  }, [skillsData]);

  useEffect(() => {
    if (!open) return;
    if (didPrefillRef.current) return;
    if (!profile) return;

    applyPrefill(profile, recentRoleSuggestions, setters);
    didPrefillRef.current = true;
    // The setters reference identity changes per render but their
    // semantics don't, and we only run once per open. Suppressing
    // the eslint "exhaustive-deps" lint by including only what
    // matters: open + profile + the derived suggestions list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile, recentRoleSuggestions]);

  function resetPrefill() {
    didPrefillRef.current = false;
  }

  return {
    profile,
    recentRoleSuggestions,
    skillSuggestions,
    isPrefillLoading,
    didPrefill: didPrefillRef.current,
    resetPrefill,
  };
}


/**
 * Apply prefill defaults to the form state. Pure mapping — no React,
 * no hooks. Easy to unit test.
 */
function applyPrefill(
  profile: Profile,
  recentRoleSuggestions: string[],
  setters: PrefillSetters,
): void {
  const defaults = profile.discovery_defaults ?? {};

  if (recentRoleSuggestions.length > 0) {
    setters.setRoles([recentRoleSuggestions[0]]);
  }

  setters.setRemoteOnly(profile.remote_preference === "remote_only");

  if (profile.desired_salary_min) {
    const parsed = Number(profile.desired_salary_min);
    if (Number.isFinite(parsed) && parsed > 0) {
      setters.setMinSalary(String(Math.floor(parsed)));
    }
  }

  if (defaults.country) setters.setCountry(defaults.country);
  if (defaults.date_posted) {
    setters.setDatePosted(defaults.date_posted as DatePosted);
  }
  if (defaults.employment_type !== undefined) {
    setters.setEmploymentType(defaults.employment_type);
  }

  if (defaults.experience !== undefined) {
    setters.setExperience(defaults.experience as Experience);
  } else {
    setters.setExperience(seniorityToExperience(profile.seniority));
  }

  if (Array.isArray(defaults.excluded_industry_chips)) {
    setters.setExcludedIndustryChips(defaults.excluded_industry_chips);
  }
  if (Array.isArray(defaults.excluded_keywords)) {
    setters.setExcludedKeywords(defaults.excluded_keywords);
  }
}


/**
 * Map profile.seniority into JSearch's job_requirements enum value.
 * Pure helper — exported for testability if needed.
 */
function seniorityToExperience(seniority: string | null): Experience {
  if (!seniority) return "";
  const s = seniority.toLowerCase();
  if (
    s.includes("senior") ||
    s.includes("staff") ||
    s.includes("principal") ||
    s.includes("lead")
  ) {
    return "more_than_3_years_experience";
  }
  if (s.includes("junior") || s.includes("entry")) {
    return "no_experience";
  }
  if (s.includes("mid")) {
    return "under_3_years_experience";
  }
  return "";
}
