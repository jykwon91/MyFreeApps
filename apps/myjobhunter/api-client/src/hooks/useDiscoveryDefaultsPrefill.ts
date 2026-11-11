import { useEffect, useMemo, useState } from "react";
import { useGetProfileQuery } from "../store/profileApi";
import { useListSkillsQuery } from "../store/skillsApi";
import { useListWorkHistoryQuery } from "../store/workHistoryApi";
import type { DiscoveryPrefill } from "../types/discovery/discovery-prefill";
import type { JSearchFormValues } from "../types/discovery/jsearch-form-values";
import { discoveryPrefill } from "../utils/discoveryPrefill";
import { recentRoleSuggestions } from "../utils/recentRoleSuggestions";
import { skillSuggestions } from "../utils/skillSuggestions";

/**
 * Fills a new JSearch saved search from the profile once per opening: its saved discovery
 * defaults first, then guesses from the profile (see discoveryPrefill). Loads the profile, skills
 * and work history only while `open`. Shared by the website dialog and the phone sheet.
 */
export function useDiscoveryDefaultsPrefill(
  open: boolean,
  onPrefill: (patch: Partial<JSearchFormValues>) => void,
): DiscoveryPrefill {
  const { data: profile, isLoading: isProfileLoading } = useGetProfileQuery(undefined, { skip: !open });
  const { data: skills, isLoading: areSkillsLoading } = useListSkillsQuery(undefined, { skip: !open });
  const { data: workHistory, isLoading: isWorkHistoryLoading } = useListWorkHistoryQuery(undefined, { skip: !open });
  const [didPrefill, setDidPrefill] = useState(false);

  const roles = useMemo(() => recentRoleSuggestions(workHistory?.items), [workHistory]);
  const skillNames = useMemo(() => skillSuggestions(skills?.items), [skills]);

  useEffect(() => {
    // Work history gives the role to start with, so it is waited for; filling in without it would leave no role.
    if (!open || didPrefill || !profile || isWorkHistoryLoading) return;
    onPrefill(discoveryPrefill(profile, roles));
    setDidPrefill(true);
    // Once per opening: a new onPrefill identity each render mustn't fill the form again.
  }, [open, didPrefill, profile, isWorkHistoryLoading, roles]);

  return {
    profile,
    recentRoleSuggestions: roles,
    skillSuggestions: skillNames,
    isPrefillLoading: open && (isProfileLoading || areSkillsLoading || isWorkHistoryLoading),
    didPrefill,
    resetPrefill: () => setDidPrefill(false),
  };
}
