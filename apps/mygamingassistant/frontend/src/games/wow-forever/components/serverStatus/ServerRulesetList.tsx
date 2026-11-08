import { SERVER_STATUS_COPY } from "@/games/wow-forever/data/serverStatus/serverStatusCopy";
import type { ServerRuleset } from "@/games/wow-forever/types/serverStatus/serverRuleset";

function statusDotClass(online: boolean): string {
  return online ? "bg-green-500" : "bg-red-500";
}

/** Each ruleset with a green (up) or red (down) dot; a down one is struck through. */
export default function ServerRulesetList({ rulesets }: { rulesets: readonly ServerRuleset[] }) {
  return (
    <ul className="space-y-2" aria-label={SERVER_STATUS_COPY.rulesetsLabel}>
      {rulesets.map((ruleset) => (
        <li key={ruleset.slug} className="flex items-center gap-2 text-sm">
          <span className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${statusDotClass(ruleset.online)}`} aria-hidden />
          <span className={ruleset.online ? "" : "text-muted-foreground line-through"}>{ruleset.name}</span>
          <span className="sr-only">{ruleset.online ? "online" : "offline"}</span>
        </li>
      ))}
    </ul>
  );
}
