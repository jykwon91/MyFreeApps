/**
 * agentDisplay — display metadata for Valorant agents (the agent-filter layer).
 *
 * Valorant utilities are agent-specific (Sova's Recon/Shock Bolt), so the map
 * page gains an agent dimension above the utility chips. This module owns:
 *   - the canonical role grouping + order for the agent <select>'s <optgroup>s
 *   - per-role badge colors so a Valorant lineup's utility badge is colored by
 *     its agent's role (the utilityDisplay slug map only covers a handful of
 *     the ~90 abilities; unknowns would otherwise render gray "Util")
 *   - lineupUtilDisplay(), which resolves a lineup's utility_type to a display
 *     blob: Valorant abilities use the backend name + role color; CS2 grenades
 *     keep the existing slug-keyed utilityDisplay verbatim.
 *
 * CS2 has no agent dimension — every helper here degrades to the CS2 path when
 * the utility has no agent.
 */
import type { Agent, UtilityTypeRead } from "@/types/game";
import { utilDisplay, type UtilDisplay } from "@/constants/utilityDisplay";

// Valorant's canonical role order — drives the agent <select> grouping.
export const ROLE_ORDER = ["Duelist", "Initiator", "Controller", "Sentinel"] as const;
export type AgentRole = (typeof ROLE_ORDER)[number];

interface RoleColor {
  badgeBg: string;
  badgeText: string;
}

// Per-role badge colors. Initiator stays teal to match utilityDisplay's
// existing `recon` color (Sova is an Initiator) so the badge color doesn't
// shift for the already-shipped Recon Bolt lineups.
const ROLE_COLOR: Record<string, RoleColor> = {
  Duelist:    { badgeBg: "bg-red-600",    badgeText: "text-white" },
  Initiator:  { badgeBg: "bg-teal-600",   badgeText: "text-white" },
  Controller: { badgeBg: "bg-violet-600", badgeText: "text-white" },
  Sentinel:   { badgeBg: "bg-amber-500",  badgeText: "text-slate-900" },
};

const FALLBACK_ROLE_COLOR: RoleColor = { badgeBg: "bg-muted", badgeText: "text-foreground" };

/** Badge color tokens for an agent role. Falls back to neutral for null /
 *  unknown roles. Never throws. */
export function agentRoleColor(role: string | null | undefined): RoleColor {
  return (role != null && ROLE_COLOR[role]) || FALLBACK_ROLE_COLOR;
}

export interface AgentGroup {
  role: string;
  agents: Agent[];
}

/**
 * Bucket agents into role groups in canonical order, alphabetised within each
 * role, dropping empty roles. Agents with an unknown / null role are bucketed
 * last under "Other" so they never silently vanish from the selector.
 */
export function groupAgentsByRole(agents: Agent[]): AgentGroup[] {
  const groups: AgentGroup[] = [];
  const known = new Set<string>(ROLE_ORDER);

  for (const role of ROLE_ORDER) {
    const inRole = agents
      .filter((a) => a.role === role)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (inRole.length > 0) groups.push({ role, agents: inRole });
  }

  const other = agents
    .filter((a) => a.role == null || !known.has(a.role))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (other.length > 0) groups.push({ role: "Other", agents: other });

  return groups;
}

/**
 * Resolve a lineup's utility_type to display metadata.
 *
 * Valorant (utility has an agent): use the backend `name` for the label and
 * color the badge by the agent's role — the slug-keyed utilityDisplay map only
 * covers a few abilities, so without this Shock Bolt et al. render as gray
 * "Util". The within-zone sortOrder still comes from utilityDisplay so any
 * CS2-style ordering of shared concepts is preserved.
 *
 * CS2 (no agent): the existing slug-keyed utilityDisplay, unchanged.
 */
export function lineupUtilDisplay(ut: UtilityTypeRead | null | undefined): UtilDisplay {
  if (ut?.agent) {
    const color = agentRoleColor(ut.agent.role);
    return {
      label: ut.name,
      chipLabel: ut.name,
      badgeBg: color.badgeBg,
      badgeText: color.badgeText,
      sortOrder: utilDisplay(ut.slug).sortOrder,
    };
  }
  return utilDisplay(ut?.slug);
}
