import WhereAreYou from "@/games/wow-forever/components/worldMap/WhereAreYou";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import type { AskToolDataState } from "@/games/wow-forever/types/ask/askToolDataState";

interface WhereAreYouCardProps {
  tools: AskToolDataState;
}

/** The answer needed your location and none is saved: the World Map's own "Where are you?" picker. */
export default function WhereAreYouCard({ tools }: WhereAreYouCardProps) {
  const { data, player, updatePlayer } = tools;
  if (data === null) return null;
  return (
    <section aria-label={ASK_COPY.whereHeading} className="space-y-2 rounded-xl border bg-card p-3">
      <h3 className="text-sm font-semibold">{ASK_COPY.whereHeading}</h3>
      <p className="text-sm text-muted-foreground">{ASK_COPY.whereBody}</p>
      <WhereAreYou
        data={data.world}
        places={data.places}
        zoneId={player.zoneId}
        position={player.position}
        onSet={(zoneId, position) => updatePlayer({ zoneId, position })}
      />
    </section>
  );
}
