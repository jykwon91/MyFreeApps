/**
 * useAgentFilter — the Valorant agent-selection layer for MapPage.
 *
 * Valorant utilities are agent-specific, so the glance board gains an agent
 * dropdown (grouped by role) above the utility chips. This hook owns:
 *   - the `?agent=` URL state (single source of truth, like `?util=`)
 *   - the present-agent grouping: game agents ∩ agents that actually own a
 *     lineup on the loaded map (so the dropdown only offers Sova today, and
 *     auto-expands as other agents' lineups are authored — no extra request)
 *   - the ability slugs owned by the selected agent, so the util-chip and
 *     loadout strips can scope to that agent (otherwise ~90 chips render)
 *   - a client-side `filterByAgent` applied to the already-loaded lineups
 *
 * Why filter client-side rather than pass `agent_slugs` to the lineups query:
 * the agent dropdown's options derive from the loaded lineups, so scoping that
 * query by agent would collapse the dropdown to just the selected agent. The
 * backend `agent_slugs` param still exists for direct API consumers; the
 * glance board filters in memory (same pattern as the zone filter).
 *
 * CS2 (isValorant=false): every output degrades to "no agent layer" — empty
 * groups (so AgentSelect renders nothing), empty ability scope, identity
 * filter — leaving the CS2 path byte-for-byte unchanged.
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { Agent, Lineup, UtilityType } from "@/types/game";
import { groupAgentsByRole, type AgentGroup } from "@/constants/agentDisplay";

interface UseAgentFilterArgs {
  /** True only for Valorant — CS2 has no agent dimension. */
  isValorant: boolean;
  /** Game-wide agent catalog from the map detail (names + roles). */
  agents: Agent[];
  /** All utility types for the game — used to scope chips to the agent. */
  utilityTypes: UtilityType[];
  /** Side-scoped lineups already loaded for the map. The dropdown options and
   *  the agent filter both derive from these, so no extra request is needed. */
  lineups: Lineup[];
}

interface UseAgentFilterResult {
  /** Selected agent slug; "" when none selected (always "" for CS2). */
  selectedAgent: string;
  /** Present agents grouped by role, in canonical role order. Empty for CS2
   *  or when no loaded lineup references an agent. */
  agentGroups: AgentGroup[];
  /** Ability slugs owned by the selected agent — scopes the util-chip +
   *  loadout strips. Empty when no agent is selected (or CS2) so those strips
   *  collapse rather than render the full Valorant ability catalog. */
  agentUtilSlugs: string[];
  /** Select an agent ("" clears). Also clears `?util=` because the previous
   *  agent's ability chips don't apply to the new agent. */
  onAgentChange: (slug: string) => void;
  /** Narrow a lineup list to the selected agent. Identity when no agent / CS2. */
  filterByAgent: (lineups: Lineup[]) => Lineup[];
}

export function useAgentFilter({
  isValorant,
  agents,
  utilityTypes,
  lineups,
}: UseAgentFilterArgs): UseAgentFilterResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAgent = isValorant ? searchParams.get("agent") ?? "" : "";

  const agentGroups = useMemo(() => {
    if (!isValorant) return [];
    const present = new Set(
      lineups
        .map((l) => l.utility_type?.agent?.slug)
        .filter((s): s is string => Boolean(s)),
    );
    return groupAgentsByRole(agents.filter((a) => present.has(a.slug)));
  }, [isValorant, agents, lineups]);

  const agentUtilSlugs = useMemo(() => {
    if (!isValorant || !selectedAgent) return [];
    return utilityTypes
      .filter((u) => u.agent_slug === selectedAgent)
      .map((u) => u.slug);
  }, [isValorant, selectedAgent, utilityTypes]);

  const onAgentChange = useCallback(
    (slug: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (slug) next.set("agent", slug);
          else next.delete("agent");
          // The prior agent's ability chips don't apply to the new agent.
          next.delete("util");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const filterByAgent = useCallback(
    (list: Lineup[]) => {
      if (!isValorant || !selectedAgent) return list;
      return list.filter((l) => l.utility_type?.agent?.slug === selectedAgent);
    },
    [isValorant, selectedAgent],
  );

  return { selectedAgent, agentGroups, agentUtilSlugs, onAgentChange, filterByAgent };
}
