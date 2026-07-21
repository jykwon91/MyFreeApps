/**
 * AgentSelect — Valorant agent picker for the MapPage top bar.
 *
 * A compact <select> whose options are grouped into <optgroup>s by agent role
 * (Duelist / Initiator / Controller / Sentinel). Selecting an agent reveals
 * that agent's ability chips downstream (the parent scopes utilOptions).
 *
 * Self-hides when there are no present agents — so CS2 (empty groups) and
 * Valorant maps with no agent lineups render nothing, keeping the CS2 top bar
 * byte-for-byte unchanged.
 */
import type { AgentGroup } from "@/constants/agentDisplay";

interface AgentSelectProps {
  agentGroups: AgentGroup[];
  /** Selected agent slug; "" means "All agents". */
  value: string;
  onChange: (slug: string) => void;
}

export default function AgentSelect({ agentGroups, value, onChange }: AgentSelectProps) {
  if (agentGroups.length === 0) return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter lineups by agent"
      title="Filter lineups by agent"
      className="shrink-0 h-6 rounded-md border bg-card/40 px-1.5 text-[11px] font-medium text-foreground hover:bg-muted/60 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors [color-scheme:light_dark]"
    >
      {/* Native <option>/<optgroup> render in an OS popup whose default
          background is white; without an explicit theme-token background the
          light `text-foreground` is invisible in dark mode. Set both so the
          list is readable in either theme. */}
      <option value="" className="bg-background text-foreground">
        All agents
      </option>
      {agentGroups.map((group) => (
        <optgroup
          key={group.role}
          label={group.role}
          className="bg-background text-muted-foreground"
        >
          {group.agents.map((agent) => (
            <option
              key={agent.slug}
              value={agent.slug}
              className="bg-background text-foreground"
            >
              {agent.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
